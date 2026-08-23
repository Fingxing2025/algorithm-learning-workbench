import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  getGitFacts,
  getReleasePaths,
  npmCommand,
  packagedElectronAbiInvocation,
  parseReleaseOptions,
  pathExists,
  readProjectFacts,
  rootDirectory,
  runCommand,
  sha256File,
} from './release-lib.mjs'
import { verifyArtifacts } from './verify-artifacts.mjs'

function changelogSection(changelog, version) {
  const marker = `## [${version}]`
  const start = changelog.indexOf(marker)
  if (start < 0) {
    throw new Error(`CHANGELOG.md 缺少 ${version} 版本段。`)
  }
  const next = changelog.indexOf('\n## [', start + marker.length)
  return changelog.slice(start, next < 0 ? undefined : next).trim()
}

async function electronModuleAbi(executablePath) {
  const invocation = packagedElectronAbiInvocation(executablePath)
  const result = await runCommand(invocation.command, invocation.args, invocation.options)
  return result.stdout.trim()
}

export async function generateReleaseMetadata(options = parseReleaseOptions()) {
  const facts = await readProjectFacts()
  const paths = getReleasePaths(facts, options)
  const sbomPath = join(paths.candidateDirectory, 'sbom.cyclonedx.json')
  if (!(await pathExists(sbomPath))) {
    throw new Error('生成发布元数据前必须先生成 SBOM。')
  }

  const [verification, git, npmVersion, abi, changelog] = await Promise.all([
    verifyArtifacts(options),
    getGitFacts(),
    runCommand(npmCommand(), ['--version'], { capture: true }),
    electronModuleAbi(paths.executablePath),
    readFile(join(rootDirectory, 'CHANGELOG.md'), 'utf8'),
  ])
  if (git.sourceTree !== 'clean') {
    throw new Error('拒绝为 dirty 源码生成发布候选元数据。')
  }

  const checksums = verification.artifacts
    .map(artifact => `${artifact.sha256}  ${artifact.name}`)
    .join('\n')
  const checksumPath = join(paths.candidateDirectory, 'SHA256SUMS.txt')
  await writeFile(checksumPath, `${checksums}\n`, 'utf8')

  const verificationPath = join(paths.candidateDirectory, 'artifact-verification.json')
  await writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8')

  const metadata = {
    schemaVersion: 1,
    build: {
      arch: options.arch,
      createdAt: new Date().toISOString(),
      mode: options.mode,
      platform: options.platform,
      sourceBranch: git.branch,
      sourceCommit: git.commit,
      sourceTree: git.sourceTree,
    },
    product: {
      appId: facts.appId,
      name: facts.productName,
      version: facts.version,
    },
    toolchain: {
      betterSqlite3: facts.betterSqliteVersion,
      electron: facts.electronVersion,
      electronBuilder: facts.electronBuilderVersion,
      electronModuleAbi: abi,
      node: process.versions.node,
      npm: npmVersion.stdout.trim(),
    },
    evidence: {
      artifacts: verification.artifacts,
      platform: verification.platformEvidence,
      privacy: verification.privacy,
      sbom: {
        file: 'sbom.cyclonedx.json',
        sha256: await sha256File(sbomPath),
      },
      windowsRealMachineAcceptance:
        options.platform === 'win' ? 'not-performed-by-ci-build' : 'not-applicable-to-macos-candidate',
    },
  }
  const metadataPath = join(paths.candidateDirectory, 'build-metadata.json')
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  const signedLabel =
    options.mode === 'signed'
      ? options.platform === 'mac'
        ? 'Developer ID signed and notarized candidate'
        : 'Authenticode signed candidate; real-machine acceptance still required'
      : 'unsigned/ad-hoc preview candidate; not a formal release'
  const notes = `# ${facts.productName} ${facts.version} 发布说明草稿

- 候选类型：${signedLabel}
- 平台/架构：${options.platform}/${options.arch}
- 源码提交：${git.commit}
- 校验文件：\`SHA256SUMS.txt\`
- 依赖清单：\`sbom.cyclonedx.json\`
- 构建证据：\`build-metadata.json\`、\`artifact-verification.json\`

${changelogSection(changelog, facts.version)}

## 发布门禁说明

${
  options.mode === 'preview'
    ? '- 本候选未携带正式平台签名，不得标记为公开正式发行版。'
    : '- 本候选已通过构建机上的平台签名验证；仍应在发布渠道保存 CI 日志与制品摘要。'
}
- CI 中的 Windows 构建或 Authenticode 验证不等于真实 Windows 安装、升级和卸载验收。
- 安装前请使用可信渠道提供的 \`SHA256SUMS.txt\` 核对下载文件。
`
  const notesPath = join(paths.candidateDirectory, 'RELEASE_NOTES.md')
  await writeFile(notesPath, notes, 'utf8')

  console.log(`发布候选证据目录：${paths.candidateDirectory}`)
  return { metadata, paths, verification }
}

await generateReleaseMetadata()
