import { join } from 'node:path'

import {
  cleanCurrentReleaseOutputs,
  getReleasePaths,
  npmCommand,
  parseReleaseOptions,
  readProjectFacts,
  rootDirectory,
  runCommand,
  signingFreeEnvironment,
} from './release-lib.mjs'

const options = parseReleaseOptions()
const facts = await readProjectFacts()
const paths = getReleasePaths(facts, options)
const environment = options.mode === 'preview' ? signingFreeEnvironment() : { ...process.env }
const commonArguments = [
  '--platform',
  options.platform,
  '--arch',
  options.arch,
  '--mode',
  options.mode,
]

console.log(`开始构建 ${facts.productName} ${facts.version} ${options.platform}/${options.arch} ${options.mode} 候选。`)
await runCommand(process.execPath, [join(rootDirectory, 'scripts/release/preflight.mjs'), ...commonArguments], {
  env: environment,
})
await cleanCurrentReleaseOutputs(paths)
await runCommand(npmCommand(), ['run', 'build'], { env: environment })

const builderArguments = [join(rootDirectory, 'node_modules/electron-builder/out/cli/cli.js')]
if (options.platform === 'mac') {
  builderArguments.push('--mac', 'dmg', 'zip', '--arm64', '--publish', 'never')
  builderArguments.push(`--config.mac.notarize=${options.mode === 'signed' ? 'true' : 'false'}`)
} else {
  builderArguments.push('--win', 'nsis', '--x64', '--publish', 'never')
}
await runCommand(process.execPath, builderArguments, { env: environment })
await runCommand(process.execPath, [join(rootDirectory, 'scripts/release/generate-sbom.mjs'), ...commonArguments], {
  env: environment,
})
await runCommand(
  process.execPath,
  [join(rootDirectory, 'scripts/release/generate-release-metadata.mjs'), ...commonArguments],
  { env: environment },
)

console.log('候选构建完成；真实打包入口 smoke 仍需作为独立门禁执行。')
for (const artifact of paths.artifacts) {
  console.log(artifact.path)
}
