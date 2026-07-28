import { createWriteStream } from 'node:fs'
import { lstat, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { openPromise, type Entry } from 'yauzl'
import { ZipFile } from 'yazl'

export const PORTABLE_ARCHIVE_MAX_ENTRIES = 20_010
export const PORTABLE_ARCHIVE_MAX_ENTRY_BYTES = 4 * 1024 * 1024 * 1024
export const PORTABLE_ARCHIVE_MAX_TOTAL_BYTES = 32 * 1024 * 1024 * 1024
const PORTABLE_ARCHIVE_MAX_COMPRESSION_RATIO = 5_000
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu
const WINDOWS_INVALID_CHARACTER = /[<>:"\\|?*]/u
const UTF8_FLAG = 0x0800
const UNIX_FILE_TYPE_MASK = 0o170000
const UNIX_SYMBOLIC_LINK = 0o120000
const ZIP_EPOCH = new Date('1980-01-01T00:00:00.000Z')

export interface PortableArchiveSource {
  absolutePath: string
  archivePath: string
}

export class PortableBackupArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortableBackupArchiveError'
  }
}

export function assertPortableArchivePath(input: string): string {
  if (input.length === 0 || input.length > 4096) {
    throw new PortableBackupArchiveError('备份包含空路径或过长路径。')
  }
  if (input !== input.normalize('NFC')) {
    throw new PortableBackupArchiveError('备份路径必须使用 NFC Unicode 形式。')
  }
  if (input.startsWith('/') || /^[a-z]:/iu.test(input)) {
    throw new PortableBackupArchiveError('备份包含绝对路径。')
  }
  if (input.includes('\\')) {
    throw new PortableBackupArchiveError('备份路径必须使用正斜杠。')
  }

  const segments = input.split('/')
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      throw new PortableBackupArchiveError('备份路径包含空段或目录穿越。')
    }
    if (segment.length > 255) {
      throw new PortableBackupArchiveError('备份路径包含超过 255 字符的文件名。')
    }
    if (
      WINDOWS_INVALID_CHARACTER.test(segment) ||
      [...segment].some(character => (character.codePointAt(0) ?? 0) <= 0x1f)
    ) {
      throw new PortableBackupArchiveError('备份路径包含 Windows 不支持的字符。')
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      throw new PortableBackupArchiveError('备份路径包含 Windows 不支持的尾随点或空格。')
    }
    const windowsBaseName = (segment.split('.')[0] ?? '').replace(/[ .]+$/u, '')
    if (WINDOWS_RESERVED_NAME.test(windowsBaseName)) {
      throw new PortableBackupArchiveError('备份路径包含 Windows 保留设备名。')
    }
  }
  return input
}

export function portableArchiveCollisionKey(path: string): string {
  return assertPortableArchivePath(path).normalize('NFC').toLocaleLowerCase('en-US')
}

function assertUniquePortablePaths(paths: string[]): void {
  const seen = new Set<string>()
  for (const path of paths) {
    const key = portableArchiveCollisionKey(path)
    if (seen.has(key)) {
      throw new PortableBackupArchiveError('备份路径在 NFC 或大小写规则下发生冲突。')
    }
    seen.add(key)
  }
}

function isSymbolicLinkEntry(entry: Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff
  return (unixMode & UNIX_FILE_TYPE_MASK) === UNIX_SYMBOLIC_LINK
}

function assertPortableEntry(entry: Entry): string {
  const path = assertPortableArchivePath(entry.fileName)
  if (entry.fileName.endsWith('/')) {
    throw new PortableBackupArchiveError('便携备份不允许目录 entry。')
  }
  if (entry.isEncrypted()) {
    throw new PortableBackupArchiveError('便携备份包含加密 entry，无法验证。')
  }
  if (isSymbolicLinkEntry(entry)) {
    throw new PortableBackupArchiveError('便携备份包含符号链接。')
  }
  const hasNonAsciiCharacter = [...path].some(character => (character.codePointAt(0) ?? 0) > 0x7f)
  if (hasNonAsciiCharacter && (entry.generalPurposeBitFlag & UTF8_FLAG) === 0) {
    throw new PortableBackupArchiveError('非 ASCII ZIP 路径没有 UTF-8/EFS 标记。')
  }
  if (entry.uncompressedSize > PORTABLE_ARCHIVE_MAX_ENTRY_BYTES) {
    throw new PortableBackupArchiveError('便携备份中的单个文件超过安全上限。')
  }
  const ratio = entry.uncompressedSize / Math.max(1, entry.compressedSize)
  if (ratio > PORTABLE_ARCHIVE_MAX_COMPRESSION_RATIO) {
    throw new PortableBackupArchiveError('便携备份的压缩比异常。')
  }
  return path
}

export async function createPortableBackupArchive(
  outputPath: string,
  sources: PortableArchiveSource[],
): Promise<void> {
  if (sources.length === 0 || sources.length > PORTABLE_ARCHIVE_MAX_ENTRIES) {
    throw new PortableBackupArchiveError('便携备份文件数量超出安全范围。')
  }
  assertUniquePortablePaths(sources.map(source => source.archivePath))

  let totalBytes = 0
  for (const source of sources) {
    const stats = await lstat(source.absolutePath)
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new PortableBackupArchiveError('便携备份只能包含普通文件。')
    }
    if (stats.size > PORTABLE_ARCHIVE_MAX_ENTRY_BYTES) {
      throw new PortableBackupArchiveError('便携备份中的单个文件超过安全上限。')
    }
    totalBytes += stats.size
    if (totalBytes > PORTABLE_ARCHIVE_MAX_TOTAL_BYTES) {
      throw new PortableBackupArchiveError('便携备份展开大小超过安全上限。')
    }
  }

  const zip = new ZipFile()
  const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 })
  const completed = pipeline(zip.outputStream as Readable, output)
  try {
    for (const source of sources) {
      zip.addFile(source.absolutePath, source.archivePath, {
        compress: true,
        compressionLevel: 6,
        mode: 0o100600,
        mtime: ZIP_EPOCH,
      })
    }
    zip.end()
    await completed
  } catch (error) {
    output.destroy()
    await rm(outputPath, { force: true }).catch(() => undefined)
    if (error instanceof PortableBackupArchiveError) throw error
    throw new PortableBackupArchiveError('创建便携 ZIP 失败。')
  }
}

export async function extractPortableBackupArchive(
  archivePath: string,
  destinationRoot: string,
): Promise<string[]> {
  await mkdir(destinationRoot, { recursive: false })
  const zip = await openPromise(archivePath, {
    autoClose: false,
    decodeStrings: true,
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  }).catch(async () => {
    await rm(destinationRoot, { force: true, recursive: true }).catch(() => undefined)
    throw new PortableBackupArchiveError('便携 ZIP 结构无效。')
  })

  const extracted: string[] = []
  const collisionKeys = new Set<string>()
  let totalBytes = 0
  try {
    if (zip.entryCount === 0 || zip.entryCount > PORTABLE_ARCHIVE_MAX_ENTRIES) {
      throw new PortableBackupArchiveError('便携备份文件数量超出安全范围。')
    }
    for await (const entry of zip.eachEntry()) {
      const entryPath = assertPortableEntry(entry)
      const collisionKey = portableArchiveCollisionKey(entryPath)
      if (collisionKeys.has(collisionKey)) {
        throw new PortableBackupArchiveError('备份路径在 NFC 或大小写规则下发生冲突。')
      }
      collisionKeys.add(collisionKey)
      totalBytes += entry.uncompressedSize
      if (totalBytes > PORTABLE_ARCHIVE_MAX_TOTAL_BYTES) {
        throw new PortableBackupArchiveError('便携备份展开大小超过安全上限。')
      }

      const target = join(destinationRoot, ...entryPath.split('/'))
      await mkdir(dirname(target), { recursive: true })
      const source = await zip.openReadStreamPromise(entry)
      await pipeline(source, createWriteStream(target, { flags: 'wx', mode: 0o600 }))
      extracted.push(entryPath)
    }
    return extracted.sort()
  } catch (error) {
    await rm(destinationRoot, { force: true, recursive: true }).catch(() => undefined)
    if (error instanceof PortableBackupArchiveError) throw error
    throw new PortableBackupArchiveError('便携 ZIP 解包或完整性校验失败。')
  } finally {
    zip.close()
  }
}
