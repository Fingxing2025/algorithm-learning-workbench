import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getReleasePaths,
  packagedElectronAbiInvocation,
  parseReleaseOptions,
  readProjectFacts,
  resolveSpawnInvocation,
  signingFreeEnvironment,
} from './release-lib.mjs'

test('release options only accept the supported native platform and architecture pairs', () => {
  assert.deepEqual(
    parseReleaseOptions(['--platform', 'mac', '--arch', 'arm64', '--mode', 'preview']),
    { arch: 'arm64', mode: 'preview', platform: 'mac' },
  )
  assert.throws(
    () => parseReleaseOptions(['--platform', 'mac', '--arch', 'x64', '--mode', 'preview']),
    /只支持 mac\/arm64/,
  )
  assert.throws(
    () => parseReleaseOptions(['--platform', 'win', '--arch', 'x64', '--mode', 'release']),
    /preview 或 signed/,
  )
})

test('artifact paths select only the current version and never glob historical releases', async () => {
  const facts = await readProjectFacts()
  const paths = getReleasePaths(facts, { arch: 'arm64', mode: 'preview', platform: 'mac' })

  assert.deepEqual(
    paths.artifacts.map(artifact => artifact.name),
    [
      `${facts.productName}-${facts.version}-mac-arm64.dmg`,
      `${facts.productName}-${facts.version}-mac-arm64.zip`,
    ],
  )
  assert.match(paths.candidateDirectory, new RegExp(`${facts.version}-mac-arm64-preview$`))
})

test('preview environment strips every supported signing and notarization secret', () => {
  const sanitized = signingFreeEnvironment({
    APPLE_API_KEY: 'private-key-path',
    APPLE_API_KEY_ID: 'key-id',
    APPLE_API_ISSUER: 'issuer',
    CSC_KEY_PASSWORD: 'password',
    CSC_LINK: 'certificate',
    SAFE_VALUE: 'kept',
    WIN_CSC_LINK: 'windows-certificate',
  })

  assert.equal(sanitized.CSC_IDENTITY_AUTO_DISCOVERY, 'false')
  assert.equal(sanitized.SAFE_VALUE, 'kept')
  assert.equal(sanitized.APPLE_API_KEY, undefined)
  assert.equal(sanitized.CSC_LINK, undefined)
  assert.equal(sanitized.WIN_CSC_LINK, undefined)
})

test('Windows batch commands run through cmd.exe without enabling a shell for other commands', () => {
  assert.deepEqual(
    resolveSpawnInvocation('npm.cmd', ['run', 'build'], {
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      platform: 'win32',
    }),
    {
      args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'build'],
      command: 'C:\\Windows\\System32\\cmd.exe',
    },
  )
  assert.deepEqual(resolveSpawnInvocation('git', ['status'], { platform: 'win32' }), {
    args: ['status'],
    command: 'git',
  })
})

test('Electron ABI is queried from the packaged application executable', () => {
  const executablePath = 'D:\\release\\win-unpacked\\算法学习工作台.exe'
  const invocation = packagedElectronAbiInvocation(executablePath, {
    SAFE_VALUE: 'kept',
  })

  assert.equal(invocation.command, executablePath)
  assert.deepEqual(invocation.args, ['-p', 'process.versions.modules'])
  assert.equal(invocation.options.capture, true)
  assert.equal(invocation.options.env.ELECTRON_RUN_AS_NODE, '1')
  assert.equal(invocation.options.env.SAFE_VALUE, 'kept')
  assert.doesNotMatch(invocation.command, /node_modules[\\/]electron/)
})
