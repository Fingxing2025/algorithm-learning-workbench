import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { open, readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'

import {
  getReleasePaths,
  parseReleaseOptions,
  pathExists,
  readProjectFacts,
  rootDirectory,
  runCommand,
  sha256File,
} from './release-lib.mjs'

const require = createRequire(import.meta.url)
const { extractFile, listPackage } = require('@electron/asar')

async function listFilesRecursively(directory) {
  const result = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await listFilesRecursively(path)))
    } else if (entry.isFile()) {
      result.push(path)
    } else if (entry.isSymbolicLink() && (await stat(path)).isFile()) {
      result.push(path)
    }
  }
  return result
}

function findSensitiveContent(buffer) {
  const text = buffer.toString('utf8')
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /AKIA[0-9A-Z]{16}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/,
    /sk-(?:(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{32,})/,
  ]
  return patterns.some(pattern => pattern.test(text))
}

async function fileContainsMarker(path, markers) {
  const overlapLength = Math.max(...markers.map(marker => marker.length)) - 1
  let overlap = Buffer.alloc(0)
  for await (const chunk of createReadStream(path)) {
    const contents = Buffer.concat([overlap, chunk])
    if (markers.some(marker => contents.includes(marker))) {
      return true
    }
    overlap = contents.subarray(Math.max(0, contents.length - overlapLength))
  }
  return false
}

async function verifyPrivacy(paths) {
  const entries = listPackage(paths.appAsarPath)
  const normalizedEntries = entries.map(entry => entry.replace(/^\//, ''))
  const forbiddenEntries = []
  const forbiddenDataDirectory = /(^|\/)(?:secrets?|problem-images|file-plan-backups|batch-import-backups|restore-preflight-backups|data-management-quarantine|test-results|playwright-report)(?:\/|$)/i
  const forbiddenExtension = /\.(?:sqlite3?|db|awb-backup|p12|pfx|pem|key|log)$/i

  for (const entry of normalizedEntries) {
    const topLevel = entry.split('/')[0]
    if (!['node_modules', 'out', 'package.json'].includes(topLevel)) {
      forbiddenEntries.push(entry)
      continue
    }
    if (forbiddenDataDirectory.test(entry) || forbiddenExtension.test(entry)) {
      forbiddenEntries.push(entry)
      continue
    }
    if (!entry.startsWith('node_modules/') && /\.(?:cpp|cc|cxx|h|hpp)$/i.test(entry)) {
      forbiddenEntries.push(entry)
    }
  }

  const externalFiles = await listFilesRecursively(paths.resourcesDirectory)
  const forbiddenExternalFiles = externalFiles
    .map(path => relative(paths.resourcesDirectory, path).split(sep).join('/'))
    .filter(entry => {
      if (entry === 'app.asar' || entry.startsWith('app.asar.unpacked/node_modules/')) {
        return false
      }
      return forbiddenDataDirectory.test(entry) || forbiddenExtension.test(entry)
    })

  const codeEntries = normalizedEntries.filter(
    entry => entry === 'package.json' || /^out\/.*\.(?:css|html|js|json)$/.test(entry),
  )
  const absoluteMarkers = [...new Set([homedir(), rootDirectory])].map(marker =>
    Buffer.from(marker, 'utf8'),
  )
  let absolutePathHits = 0
  let secretPatternHits = 0
  for (const entry of codeEntries) {
    const contents = extractFile(paths.appAsarPath, entry)
    if (findSensitiveContent(contents)) {
      secretPatternHits += 1
    }
  }
  const applicationFiles = await listFilesRecursively(paths.appBundlePath)
  for (const path of applicationFiles) {
    if (await fileContainsMarker(path, absoluteMarkers)) {
      absolutePathHits += 1
    }
  }

  const passed =
    forbiddenEntries.length === 0 &&
    forbiddenExternalFiles.length === 0 &&
    absolutePathHits === 0 &&
    secretPatternHits === 0
  if (!passed) {
    throw new Error(
      `产物隐私检查失败：禁用 ASAR 条目 ${forbiddenEntries.length}，禁用外部文件 ${forbiddenExternalFiles.length}，绝对路径命中 ${absolutePathHits}，疑似密钥命中 ${secretPatternHits}。`,
    )
  }

  return {
    absolutePathHits,
    asarEntryCount: normalizedEntries.length,
    forbiddenEntryCount: forbiddenEntries.length,
    forbiddenExternalFileCount: forbiddenExternalFiles.length,
    passed,
    scannedApplicationFileCount: applicationFiles.length,
    scannedApplicationEntryCount: codeEntries.length,
    secretPatternHits,
  }
}

async function readPlistValue(infoPlistPath, key) {
  const result = await runCommand(
    'plutil',
    ['-extract', key, 'raw', '-o', '-', infoPlistPath],
    { capture: true },
  )
  return result.stdout.trim()
}

async function macSignatureReport(appBundlePath) {
  const details = await runCommand('codesign', ['-dv', '--verbose=4', appBundlePath], {
    allowFailure: true,
    capture: true,
  })
  const combined = `${details.stdout}\n${details.stderr}`
  const verification = await runCommand(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appBundlePath],
    { allowFailure: true, capture: true },
  )
  const teamIdentifier = combined.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() ?? null
  const authorities = [...combined.matchAll(/^Authority=(.+)$/gm)].map(match => match[1].trim())
  const kind = authorities.some(authority => authority.startsWith('Developer ID Application:'))
    ? 'developer-id'
    : /Signature=adhoc/.test(combined)
      ? 'ad-hoc'
      : 'unsigned-or-unsealed'
  const staple = await runCommand('xcrun', ['stapler', 'validate', appBundlePath], {
    allowFailure: true,
    capture: true,
  })
  const gatekeeper = await runCommand('spctl', ['-a', '-vv', '-t', 'exec', appBundlePath], {
    allowFailure: true,
    capture: true,
  })

  return {
    authorities,
    gatekeeperAccepted: gatekeeper.code === 0,
    kind,
    notarizationStapled: staple.code === 0,
    teamIdentifier: teamIdentifier === 'not set' ? null : teamIdentifier,
    verified: verification.code === 0,
  }
}

async function verifyMac(facts, options, paths) {
  const infoPlistPath = join(paths.appBundlePath, 'Contents', 'Info.plist')
  const [bundleIdentifier, appVersion, buildVersion, minimumSystemVersion] = await Promise.all([
    readPlistValue(infoPlistPath, 'CFBundleIdentifier'),
    readPlistValue(infoPlistPath, 'CFBundleShortVersionString'),
    readPlistValue(infoPlistPath, 'CFBundleVersion'),
    readPlistValue(infoPlistPath, 'LSMinimumSystemVersion'),
  ])
  if (bundleIdentifier !== facts.appId || appVersion !== facts.version || buildVersion !== facts.version) {
    throw new Error('Info.plist 的 appId 或版本与 package.json 不一致。')
  }

  const executable = await runCommand('file', ['-b', paths.executablePath], { capture: true })
  const nativeModule = await runCommand('file', ['-b', paths.nativeModulePath], { capture: true })
  if (!executable.stdout.includes(options.arch) || !nativeModule.stdout.includes(options.arch)) {
    throw new Error('App 主程序或 better_sqlite3.node 架构与候选目标不一致。')
  }

  const dmg = paths.artifacts.find(artifact => artifact.extension === 'dmg')
  await runCommand('hdiutil', ['verify', dmg.path], { capture: true })
  const signature = await macSignatureReport(paths.appBundlePath)

  if (options.mode === 'signed') {
    if (
      !signature.verified ||
      signature.kind !== 'developer-id' ||
      !signature.teamIdentifier ||
      !signature.notarizationStapled ||
      !signature.gatekeeperAccepted
    ) {
      throw new Error('signed 候选未同时通过 Developer ID、TeamIdentifier、staple 与 Gatekeeper 验证。')
    }
  } else if (signature.kind === 'developer-id' || signature.teamIdentifier) {
    throw new Error('preview 候选意外包含发布者身份，拒绝将已签名包标记为未签名预览。')
  }

  return {
    app: {
      bundleIdentifier,
      buildVersion,
      minimumSystemVersion,
      version: appVersion,
    },
    architecture: {
      executable: executable.stdout.trim(),
      nativeModule: nativeModule.stdout.trim(),
    },
    dmgVerified: true,
    signature,
  }
}

function readPeArchitecture(buffer) {
  if (buffer.length < 64 || buffer.toString('ascii', 0, 2) !== 'MZ') {
    return 'not-pe'
  }
  const peOffset = buffer.readUInt32LE(0x3c)
  if (buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    return 'not-pe'
  }
  const machine = buffer.readUInt16LE(peOffset + 4)
  return machine === 0x8664 ? 'x64' : `unknown-0x${machine.toString(16)}`
}

async function readPeArchitectureFromFile(path) {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(512)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return readPeArchitecture(buffer.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

async function powershellSignature(path) {
  const escapedPath = path.replaceAll("'", "''")
  const command = `$s=Get-AuthenticodeSignature -LiteralPath '${escapedPath}'; [pscustomobject]@{Status=$s.Status.ToString();Subject=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress`
  const result = await runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { capture: true },
  )
  return JSON.parse(result.stdout.trim())
}

async function powershellVersion(path) {
  const escapedPath = path.replaceAll("'", "''")
  const command = `(Get-Item -LiteralPath '${escapedPath}').VersionInfo.ProductVersion`
  const result = await runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { capture: true },
  )
  return result.stdout.trim()
}

async function verifyWindows(facts, options, paths) {
  const installer = paths.artifacts[0]
  const [
    installerSignature,
    executableSignature,
    executableArchitecture,
    nativeModuleArchitecture,
    executableVersion,
  ] =
    await Promise.all([
      powershellSignature(installer.path),
      powershellSignature(paths.executablePath),
      readPeArchitectureFromFile(paths.executablePath),
      readPeArchitectureFromFile(paths.nativeModulePath),
      powershellVersion(paths.executablePath),
    ])
  if (executableArchitecture !== options.arch || nativeModuleArchitecture !== options.arch) {
    throw new Error('Windows 主程序或 better_sqlite3.node 不是目标 x64 PE。')
  }
  if (!executableVersion.startsWith(facts.version)) {
    throw new Error(`Windows App 版本 ${executableVersion} 与 package.json ${facts.version} 不一致。`)
  }

  const signed = installerSignature.Status === 'Valid' && executableSignature.Status === 'Valid'
  if (options.mode === 'signed' && !signed) {
    throw new Error('signed Windows 候选未通过安装器与 App Authenticode 验证。')
  }
  if (options.mode === 'preview' && signed) {
    throw new Error('preview Windows 候选意外包含有效 Authenticode 签名。')
  }

  return {
    app: { bundleIdentifier: facts.appId, executableVersion, version: facts.version },
    architecture: {
      executable: executableArchitecture,
      nativeModule: nativeModuleArchitecture,
    },
    signature: {
      executableStatus: executableSignature.Status,
      installerStatus: installerSignature.Status,
      kind: signed ? 'authenticode' : 'unsigned',
      verified: signed,
    },
  }
}

export async function verifyArtifacts(options = parseReleaseOptions()) {
  const facts = await readProjectFacts()
  const paths = getReleasePaths(facts, options)
  const requiredPaths = [
    paths.appAsarPath,
    paths.executablePath,
    paths.nativeModulePath,
    ...paths.artifacts.map(artifact => artifact.path),
  ]
  for (const path of requiredPaths) {
    if (!(await pathExists(path))) {
      throw new Error(`当前版本候选缺少预期文件：${path}`)
    }
  }

  const artifacts = []
  for (const artifact of paths.artifacts) {
    const fileStat = await stat(artifact.path)
    artifacts.push({
      bytes: fileStat.size,
      name: basename(artifact.path),
      sha256: await sha256File(artifact.path),
    })
  }

  const platformEvidence =
    options.platform === 'mac'
      ? await verifyMac(facts, options, paths)
      : await verifyWindows(facts, options, paths)
  const privacy = await verifyPrivacy(paths)

  return {
    appId: facts.appId,
    arch: options.arch,
    artifacts,
    mode: options.mode,
    platform: options.platform,
    platformEvidence,
    privacy,
    productName: facts.productName,
    version: facts.version,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(await verifyArtifacts(), null, 2))
}
