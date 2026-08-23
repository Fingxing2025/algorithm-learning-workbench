import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  getGitFacts,
  getReleasePaths,
  parseReleaseOptions,
  pathExists,
  readProjectFacts,
  rootDirectory,
  runCommand,
} from './release-lib.mjs'

function completeEnvironmentGroup(names) {
  return names.every(name => Boolean(process.env[name]))
}

async function assertTool(command, args = ['--version']) {
  const result = await runCommand(command, args, { allowFailure: true, capture: true })
  if (result.code !== 0) {
    throw new Error(`发布预检缺少工具：${command} ${args.join(' ')}`)
  }
}

async function assertMacSigningPrerequisites() {
  const identities = await runCommand('security', ['find-identity', '-v', '-p', 'codesigning'], {
    allowFailure: true,
    capture: true,
  })
  const hasDeveloperId = /Developer ID Application:/.test(`${identities.stdout}\n${identities.stderr}`)
  const hasCertificateArchive = Boolean(
    (process.env.CSC_LINK || process.env.CSC_NAME) &&
      (process.env.CSC_KEY_PASSWORD || process.env.CSC_NAME),
  )
  if (!hasDeveloperId && !hasCertificateArchive) {
    throw new Error(
      'signed 模式需要 Keychain 中的 Developer ID Application，或受保护的 CSC_LINK/CSC_KEY_PASSWORD。',
    )
  }

  const hasApiKey = completeEnvironmentGroup([
    'APPLE_API_KEY',
    'APPLE_API_KEY_ID',
    'APPLE_API_ISSUER',
  ])
  const hasAppleId = completeEnvironmentGroup([
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ])
  const hasKeychainProfile = completeEnvironmentGroup(['APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE'])
  if (!hasApiKey && !hasAppleId && !hasKeychainProfile) {
    throw new Error(
      'signed 模式缺少完整 notarization 凭据；优先配置 APPLE_API_KEY、APPLE_API_KEY_ID、APPLE_API_ISSUER。',
    )
  }
}

function assertWindowsSigningPrerequisites() {
  const hasCertificate = Boolean(process.env.WIN_CSC_LINK || process.env.CSC_LINK)
  const hasPassword = Boolean(process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD)
  if (!hasCertificate || !hasPassword) {
    throw new Error(
      'signed 模式需要受保护的 WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD（或 CSC_LINK/CSC_KEY_PASSWORD）。',
    )
  }
}

const options = parseReleaseOptions()
const expectedHost = options.platform === 'mac' ? 'darwin' : 'win32'
if (process.platform !== expectedHost) {
  throw new Error(`${options.platform} 候选必须在对应原生操作系统构建，当前为 ${process.platform}。`)
}
if (process.arch !== options.arch) {
  throw new Error(`候选架构要求 ${options.arch}，当前 Node 进程为 ${process.arch}。`)
}
if (Number.parseInt(process.versions.node.split('.')[0], 10) < 24) {
  throw new Error(`发布要求 Node.js 24 或更高版本，当前为 ${process.versions.node}。`)
}

const facts = await readProjectFacts()
const paths = getReleasePaths(facts, options)
const git = await getGitFacts()
if (git.sourceTree !== 'clean') {
  throw new Error('发布候选必须来自干净的已提交源码；受保护的未跟踪 问题反馈.txt 不计入 dirty。')
}

if (facts.appId !== 'com.algorithmworkbench.desktop') {
  throw new Error(`appId 与已接受架构不一致：${facts.appId}`)
}
if (facts.productName !== '算法学习工作台') {
  throw new Error(`productName 与已接受架构不一致：${facts.productName}`)
}
if (facts.artifactName !== '${productName}-${version}-${os}-${arch}.${ext}') {
  throw new Error('artifactName 必须同时包含版本、平台和架构。')
}
if (facts.packageJson.build?.asar !== true) {
  throw new Error('发布产物必须启用 ASAR。')
}
if (!facts.packageJson.build?.asarUnpack?.includes('node_modules/better-sqlite3/**/*')) {
  throw new Error('better-sqlite3 必须显式从 ASAR 解包。')
}
if (!facts.packageJson.scripts?.['rebuild:native']?.includes(`-v ${facts.electronVersion}`)) {
  throw new Error('rebuild:native 的 Electron ABI 目标与 lockfile 版本不一致。')
}
if (facts.packageJson.build?.mac?.hardenedRuntime !== true) {
  throw new Error('macOS 发布配置必须启用 hardened runtime。')
}
if (
  facts.packageJson.build?.mac?.entitlements !== 'build/entitlements.mac.plist' ||
  facts.packageJson.build?.mac?.entitlementsInherit !== 'build/entitlements.mac.inherit.plist'
) {
  throw new Error('electron-builder 必须显式使用仓库内的最小 entitlement。')
}

const entitlements = [
  join(rootDirectory, 'build', 'entitlements.mac.plist'),
  join(rootDirectory, 'build', 'entitlements.mac.inherit.plist'),
]
for (const path of entitlements) {
  if (!(await pathExists(path))) {
    throw new Error(`缺少显式 entitlement：${path}`)
  }
  const contents = await readFile(path, 'utf8')
  if (contents.includes('com.apple.security.cs.disable-library-validation')) {
    throw new Error('最小 entitlement 不允许 disable-library-validation。')
  }
}

const ignoredRelease = await runCommand('git', ['check-ignore', '-q', 'release/probe'], {
  allowFailure: true,
  capture: true,
})
if (ignoredRelease.code !== 0) {
  throw new Error('release/ 必须保持 Git 忽略。')
}
const protectedConfigDiff = await runCommand(
  'git',
  ['diff', '--quiet', 'HEAD', '--', '.codex/config.toml'],
  { allowFailure: true, capture: true },
)
if (protectedConfigDiff.code !== 0) {
  throw new Error('受保护的 .codex/config.toml 存在改动。')
}

if (options.platform === 'mac') {
  await Promise.all([
    assertTool('hdiutil', ['help']),
    assertTool('plutil', ['-help']),
    assertTool('xcrun', ['--find', 'codesign']),
    assertTool('xcrun', ['--find', 'stapler']),
    assertTool('xcrun', ['--find', 'notarytool']),
    assertTool('xcrun', ['--find', 'sips']),
  ])
  if (options.mode === 'signed') {
    await assertMacSigningPrerequisites()
  }
} else {
  await assertTool('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'])
  if (options.mode === 'signed') {
    assertWindowsSigningPrerequisites()
  }
}

console.log(
  JSON.stringify(
    {
      appId: facts.appId,
      arch: options.arch,
      candidateDirectory: paths.candidateDirectory,
      commit: git.commit,
      electron: facts.electronVersion,
      electronBuilder: facts.electronBuilderVersion,
      mode: options.mode,
      node: process.versions.node,
      platform: options.platform,
      productName: facts.productName,
      sourceTree: git.sourceTree,
      version: facts.version,
    },
    null,
    2,
  ),
)
