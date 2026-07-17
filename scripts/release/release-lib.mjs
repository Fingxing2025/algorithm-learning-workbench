import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const releaseDirectory = join(rootDirectory, 'release')
export const protectedUntrackedFiles = new Set(['问题反馈.txt'])

export function parseReleaseOptions(argv = process.argv.slice(2)) {
  const values = new Map()

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`无法识别的发布参数：${argument}`)
    }

    const separator = argument.indexOf('=')
    if (separator > 2) {
      values.set(argument.slice(2, separator), argument.slice(separator + 1))
      continue
    }

    const name = argument.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`发布参数 --${name} 缺少值。`)
    }
    values.set(name, value)
    index += 1
  }

  const hostPlatform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : null
  const platform = values.get('platform') ?? hostPlatform
  const mode = values.get('mode') ?? 'preview'
  const arch = values.get('arch') ?? (platform === 'mac' ? 'arm64' : 'x64')

  if (platform !== 'mac' && platform !== 'win') {
    throw new Error('必须通过 --platform 指定 mac 或 win。')
  }
  if (mode !== 'preview' && mode !== 'signed') {
    throw new Error('发布模式必须是 preview 或 signed。')
  }
  if ((platform === 'mac' && arch !== 'arm64') || (platform === 'win' && arch !== 'x64')) {
    throw new Error('当前发布边界只支持 mac/arm64 与 win/x64。')
  }

  return { arch, mode, platform }
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function readProjectFacts() {
  const packageJson = await readJson(join(rootDirectory, 'package.json'))
  const packageLock = await readJson(join(rootDirectory, 'package-lock.json'))
  const lockRoot = packageLock.packages?.['']
  const electronPackage = packageLock.packages?.['node_modules/electron']
  const electronBuilderPackage = packageLock.packages?.['node_modules/electron-builder']
  const betterSqlitePackage = packageLock.packages?.['node_modules/better-sqlite3']

  if (!lockRoot || packageLock.version !== packageJson.version || lockRoot.version !== packageJson.version) {
    throw new Error('package.json 与 package-lock.json 的版本事实不一致。')
  }
  if (packageLock.name !== packageJson.name || lockRoot.name !== packageJson.name) {
    throw new Error('package.json 与 package-lock.json 的包名事实不一致。')
  }

  return {
    appId: packageJson.build?.appId,
    artifactName: packageJson.build?.artifactName,
    betterSqliteVersion: betterSqlitePackage?.version,
    electronBuilderVersion: electronBuilderPackage?.version,
    electronVersion: electronPackage?.version,
    name: packageJson.name,
    packageJson,
    productName: packageJson.build?.productName ?? packageJson.productName,
    version: packageJson.version,
  }
}

function expandArtifactName(template, variables) {
  return template.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const value = variables[name]
    if (!value) {
      throw new Error(`artifactName 使用了未解析的变量：${name}`)
    }
    return value
  })
}

export function getReleasePaths(facts, options) {
  const common = {
    arch: options.arch,
    os: options.platform,
    productName: facts.productName,
    version: facts.version,
  }
  const extensions = options.platform === 'mac' ? ['dmg', 'zip'] : ['exe']
  const artifacts = extensions.map(extension => {
    const name = expandArtifactName(facts.artifactName, { ...common, ext: extension })
    return { extension, name, path: join(releaseDirectory, name) }
  })
  const unpackedDirectory =
    options.platform === 'mac'
      ? join(releaseDirectory, `mac-${options.arch}`)
      : join(releaseDirectory, 'win-unpacked')
  const executablePath =
    options.platform === 'mac'
      ? join(
          unpackedDirectory,
          `${facts.productName}.app`,
          'Contents',
          'MacOS',
          facts.productName,
        )
      : join(unpackedDirectory, `${facts.productName}.exe`)
  const appBundlePath =
    options.platform === 'mac'
      ? join(unpackedDirectory, `${facts.productName}.app`)
      : unpackedDirectory
  const resourcesDirectory =
    options.platform === 'mac'
      ? join(appBundlePath, 'Contents', 'Resources')
      : join(unpackedDirectory, 'resources')

  return {
    appBundlePath,
    appAsarPath: join(resourcesDirectory, 'app.asar'),
    artifacts,
    candidateDirectory: join(
      releaseDirectory,
      'candidates',
      `${facts.version}-${options.platform}-${options.arch}-${options.mode}`,
    ),
    executablePath,
    nativeModulePath: join(
      resourcesDirectory,
      'app.asar.unpacked',
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    ),
    resourcesDirectory,
    unpackedDirectory,
  }
}

export async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function cleanCurrentReleaseOutputs(paths) {
  await Promise.all([
    ...paths.artifacts.map(artifact => rm(artifact.path, { force: true })),
    rm(paths.unpackedDirectory, { force: true, recursive: true }),
    rm(paths.candidateDirectory, { force: true, recursive: true }),
  ])
  await mkdir(paths.candidateDirectory, { recursive: true })
}

export async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

export function runCommand(command, args, options = {}) {
  const { allowFailure = false, capture = false, cwd = rootDirectory, env = process.env } = options

  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''

    if (capture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        stdout += chunk
      })
      child.stderr.on('data', chunk => {
        stderr += chunk
      })
    }

    child.on('error', rejectCommand)
    child.on('close', code => {
      const result = { code: code ?? 1, stderr, stdout }
      if (result.code !== 0 && !allowFailure) {
        rejectCommand(
          new Error(
            `${command} ${args.join(' ')} 执行失败（退出码 ${result.code}）。${capture ? `\n${stderr || stdout}` : ''}`,
          ),
        )
        return
      }
      resolveCommand(result)
    })
  })
}

export function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function signingFreeEnvironment(environment = process.env) {
  const result = { ...environment, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  const secretNames = [
    'APPLE_API_ISSUER',
    'APPLE_API_KEY',
    'APPLE_API_KEY_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_ID',
    'APPLE_KEYCHAIN',
    'APPLE_KEYCHAIN_PROFILE',
    'APPLE_TEAM_ID',
    'CSC_KEY_PASSWORD',
    'CSC_LINK',
    'CSC_NAME',
    'WIN_CSC_KEY_PASSWORD',
    'WIN_CSC_LINK',
  ]
  for (const name of secretNames) {
    delete result[name]
  }
  return result
}

export async function getGitFacts() {
  const commit = await runCommand('git', ['rev-parse', 'HEAD'], { capture: true })
  const branch = await runCommand('git', ['branch', '--show-current'], { capture: true })
  const tracked = await runCommand('git', ['status', '--porcelain', '--untracked-files=no'], {
    capture: true,
  })
  const untracked = await runCommand('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    capture: true,
  })
  const unexpectedUntracked = untracked.stdout
    .split('\0')
    .filter(Boolean)
    .filter(path => !protectedUntrackedFiles.has(path))

  return {
    branch: branch.stdout.trim(),
    commit: commit.stdout.trim(),
    sourceTree: tracked.stdout.trim() || unexpectedUntracked.length > 0 ? 'dirty' : 'clean',
    unexpectedUntrackedCount: unexpectedUntracked.length,
  }
}

export async function ensureParentDirectory(path) {
  await mkdir(dirname(path), { recursive: true })
}
