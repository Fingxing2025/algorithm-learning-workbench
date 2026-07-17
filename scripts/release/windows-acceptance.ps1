param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [ValidateSet('Preview', 'Signed')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedVersion,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedSha256,

  [string]$ExistingV2UserDataPath,

  [string]$EvidencePath = 'windows-acceptance-evidence.json'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'Windows 实机验收脚本只能在真实 Windows 主机运行。'
}

$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
if ($actualHash -ne $ExpectedSha256.ToLowerInvariant()) {
  throw "安装器 SHA-256 不一致：$actualHash"
}

$installerSignature = Get-AuthenticodeSignature -LiteralPath $installer
if ($Mode -eq 'Signed' -and $installerSignature.Status -ne 'Valid') {
  throw "正式候选的 Authenticode 状态不是 Valid：$($installerSignature.Status)"
}
if ($Mode -eq 'Preview' -and $installerSignature.Status -eq 'Valid') {
  throw 'Preview 候选意外带有有效 Authenticode；请使用 Signed 模式记录。'
}

$testRoot = Join-Path $env:TEMP "algorithm-workbench-acceptance-$([guid]::NewGuid())"
$installDirectory = Join-Path $testRoot 'install'
$freshUserData = Join-Path $testRoot 'fresh-user-data'
New-Item -ItemType Directory -Path $installDirectory, $freshUserData -Force | Out-Null

$result = [ordered]@{
  schemaVersion = 1
  candidate = [ordered]@{
    version = $ExpectedVersion
    sha256 = $actualHash
    signatureStatus = $installerSignature.Status.ToString()
    signerSubject = if ($null -eq $installerSignature.SignerCertificate) { $null } else { $installerSignature.SignerCertificate.Subject }
  }
  install = [ordered]@{
    exitCode = $null
    executableFound = $false
    executableVersion = $null
    launchStayedAlive = $false
    desktopShortcutFound = $false
    startMenuShortcutFound = $false
  }
  existingV2Data = [ordered]@{
    requested = -not [string]::IsNullOrWhiteSpace($ExistingV2UserDataPath)
    launchStayedAlive = $null
    databasePresentBefore = $null
    databasePresentAfter = $null
  }
  uninstall = [ordered]@{
    exitCode = $null
    installDirectoryRemoved = $false
    freshUserDataPreserved = $false
    existingV2UserDataPreserved = $null
  }
  manualChecksStillRequired = @(
    '确认首次启动页面和中文文案正常'
    '确认已有 V2 模板、题目、关系、图片与 Provider 非密钥配置可见'
    '确认升级后 API Key 状态符合原系统安全存储行为'
    '确认安装目录选择、开始菜单和桌面快捷方式符合预期'
    '确认卸载器没有删除用户明确保留的模板工作区和 V2 userData'
  )
}

try {
  $installProcess = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDirectory") -Wait -PassThru
  $result.install.exitCode = $installProcess.ExitCode
  if ($installProcess.ExitCode -ne 0) {
    throw "NSIS 静默安装失败：$($installProcess.ExitCode)"
  }

  $appExecutable = Join-Path $installDirectory '算法学习工作台.exe'
  if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
    throw "安装后未找到 App：$appExecutable"
  }
  $result.install.executableFound = $true
  $result.install.executableVersion = (Get-Item -LiteralPath $appExecutable).VersionInfo.ProductVersion
  if (-not $result.install.executableVersion.StartsWith($ExpectedVersion)) {
    throw "安装后 App 版本不匹配：$($result.install.executableVersion)"
  }

  $appSignature = Get-AuthenticodeSignature -LiteralPath $appExecutable
  if ($Mode -eq 'Signed' -and $appSignature.Status -ne 'Valid') {
    throw "安装后 App Authenticode 状态不是 Valid：$($appSignature.Status)"
  }

  $env:NODE_ENV = 'test'
  $env:E2E_USER_DATA_DIR = $freshUserData
  $appProcess = Start-Process -FilePath $appExecutable -PassThru
  Start-Sleep -Seconds 8
  $result.install.launchStayedAlive = -not $appProcess.HasExited
  if ($appProcess.HasExited) {
    throw "全新 userData 启动后提前退出：$($appProcess.ExitCode)"
  }
  Stop-Process -Id $appProcess.Id -Force

  $desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '算法学习工作台.lnk'
  $startMenuShortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\算法学习工作台.lnk'
  $result.install.desktopShortcutFound = Test-Path -LiteralPath $desktopShortcut -PathType Leaf
  $result.install.startMenuShortcutFound = Test-Path -LiteralPath $startMenuShortcut -PathType Leaf

  if ($result.existingV2Data.requested) {
    $existingPath = (Resolve-Path -LiteralPath $ExistingV2UserDataPath).Path
    $existingDatabase = Join-Path $existingPath 'algorithm-workbench.sqlite'
    $result.existingV2Data.databasePresentBefore = Test-Path -LiteralPath $existingDatabase -PathType Leaf
    if (-not $result.existingV2Data.databasePresentBefore) {
      throw '指定的已有 V2 userData 不含 algorithm-workbench.sqlite。'
    }
    $env:E2E_USER_DATA_DIR = $existingPath
    $existingProcess = Start-Process -FilePath $appExecutable -PassThru
    Start-Sleep -Seconds 8
    $result.existingV2Data.launchStayedAlive = -not $existingProcess.HasExited
    if ($existingProcess.HasExited) {
      throw "已有 V2 userData 启动后提前退出：$($existingProcess.ExitCode)"
    }
    Stop-Process -Id $existingProcess.Id -Force
    $result.existingV2Data.databasePresentAfter = Test-Path -LiteralPath $existingDatabase -PathType Leaf
  }

  $uninstaller = Get-ChildItem -LiteralPath $installDirectory -Filter 'Uninstall*.exe' -File | Select-Object -First 1
  if ($null -eq $uninstaller) {
    throw '安装目录中未找到 NSIS 卸载器。'
  }
  $uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
  $result.uninstall.exitCode = $uninstallProcess.ExitCode
  if ($uninstallProcess.ExitCode -ne 0) {
    throw "NSIS 静默卸载失败：$($uninstallProcess.ExitCode)"
  }
  Start-Sleep -Seconds 2
  $result.uninstall.installDirectoryRemoved = -not (Test-Path -LiteralPath $installDirectory)
  $result.uninstall.freshUserDataPreserved = Test-Path -LiteralPath $freshUserData -PathType Container
  if ($result.existingV2Data.requested) {
    $result.uninstall.existingV2UserDataPreserved = Test-Path -LiteralPath $ExistingV2UserDataPath -PathType Container
  }
} finally {
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  Remove-Item Env:E2E_USER_DATA_DIR -ErrorAction SilentlyContinue
  $evidence = $result | ConvertTo-Json -Depth 8
  $evidence | Set-Content -LiteralPath $EvidencePath -Encoding utf8
  Write-Host "验收证据已写入：$EvidencePath"
}

if (-not $result.install.launchStayedAlive -or -not $result.uninstall.freshUserDataPreserved) {
  throw 'Windows 自动验收未通过全部可自动检查项。'
}

Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '自动检查完成；请逐项完成人工 UI、升级数据可见性、权限与保留策略核对后再签署 Windows 实机验收。'
