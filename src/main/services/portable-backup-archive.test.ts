import { createWriteStream } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { afterEach, describe, expect, it } from 'vitest'
import { ZipFile } from 'yazl'

import {
  assertPortableArchivePath,
  createPortableBackupArchive,
  extractPortableBackupArchive,
  portableArchiveCollisionKey,
} from './portable-backup-archive'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'awb-portable-backup-'))
  roots.push(root)
  return root
}

async function writeRawArchive(path: string, addEntries: (zip: ZipFile) => void): Promise<void> {
  const zip = new ZipFile()
  const completed = pipeline(zip.outputStream as Readable, createWriteStream(path))
  addEntries(zip)
  zip.end()
  await completed
}

describe('portable backup paths', () => {
  it('accepts NFC Chinese paths and derives a case-insensitive collision key', () => {
    expect(assertPortableArchivePath('data/template-sources/id/图论/最短路.cpp')).toBe(
      'data/template-sources/id/图论/最短路.cpp',
    )
    expect(portableArchiveCollisionKey('Data/模板.CPP')).toBe(
      portableArchiveCollisionKey('data/模板.cpp'),
    )
  })

  it.each([
    '../escape.txt',
    '/absolute.txt',
    'C:/absolute.txt',
    'data\\windows.txt',
    'data/CON.cpp',
    'data/CON .txt',
    'data/trailing. ',
    'data/a?.cpp',
    `data/${'e\u0301'}.cpp`,
  ])('rejects non-portable path %s', path => {
    expect(() => assertPortableArchivePath(path)).toThrow()
  })
})

describe('portable backup ZIP', () => {
  it('round-trips UTF-8 names and preserves source bytes', async () => {
    const root = await temporaryRoot()
    const sourceRoot = join(root, 'source')
    const extractRoot = join(root, 'extract')
    const archivePath = join(root, 'backup.awb-backup')
    await mkdir(sourceRoot)
    const sourcePath = join(sourceRoot, 'source.cpp')
    const sourceBytes = Buffer.from([0x00, 0x41, 0xff, 0x0a])
    await writeFile(sourcePath, sourceBytes)

    await createPortableBackupArchive(archivePath, [
      { absolutePath: sourcePath, archivePath: 'data/template-sources/id/图论/最短路.cpp' },
    ])
    const entries = await extractPortableBackupArchive(archivePath, extractRoot)

    expect(entries).toEqual(['data/template-sources/id/图论/最短路.cpp'])
    expect(
      await readFile(join(extractRoot, 'data', 'template-sources', 'id', '图论', '最短路.cpp')),
    ).toEqual(sourceBytes)
  })

  it('rejects case-fold collisions before writing an archive', async () => {
    const root = await temporaryRoot()
    const first = join(root, 'first')
    const second = join(root, 'second')
    await writeFile(first, 'a')
    await writeFile(second, 'b')

    await expect(
      createPortableBackupArchive(join(root, 'collision.awb-backup'), [
        { absolutePath: first, archivePath: 'data/A.cpp' },
        { absolutePath: second, archivePath: 'data/a.cpp' },
      ]),
    ).rejects.toThrow(/冲突/u)
  })

  it('rejects a patched Zip Slip entry before it can escape the destination', async () => {
    const root = await temporaryRoot()
    const safeArchive = join(root, 'safe.zip')
    const maliciousArchive = join(root, 'zip-slip.awb-backup')
    await writeRawArchive(safeArchive, zip => {
      zip.addBuffer(Buffer.from('escape'), 'aa/escape.txt')
    })

    const bytes = await readFile(safeArchive)
    const safeName = Buffer.from('aa/escape.txt')
    const maliciousName = Buffer.from('../escape.txt')
    let replacements = 0
    for (
      let offset = bytes.indexOf(safeName);
      offset >= 0;
      offset = bytes.indexOf(safeName, offset)
    ) {
      maliciousName.copy(bytes, offset)
      replacements += 1
      offset += maliciousName.length
    }
    expect(replacements).toBe(2)
    await writeFile(maliciousArchive, bytes)

    await expect(
      extractPortableBackupArchive(maliciousArchive, join(root, 'extract-zip-slip')),
    ).rejects.toThrow(/便携 ZIP|目录穿越/u)
    await expect(readFile(join(root, 'escape.txt'))).rejects.toThrow()
  })

  it('rejects symbolic-link entries and removes the partial destination', async () => {
    const root = await temporaryRoot()
    const archivePath = join(root, 'symbolic-link.awb-backup')
    const extractRoot = join(root, 'extract-symbolic-link')
    await writeRawArchive(archivePath, zip => {
      zip.addBuffer(Buffer.from('target.txt'), 'data/link', { mode: 0o120777 })
    })

    await expect(extractPortableBackupArchive(archivePath, extractRoot)).rejects.toThrow(
      /符号链接/u,
    )
    await expect(readFile(join(extractRoot, 'data', 'link'))).rejects.toThrow()
  })

  it('rejects case-fold collisions found in an externally-created archive', async () => {
    const root = await temporaryRoot()
    const archivePath = join(root, 'external-collision.awb-backup')
    const extractRoot = join(root, 'extract-collision')
    await writeRawArchive(archivePath, zip => {
      zip.addBuffer(Buffer.from('first'), 'data/A.cpp')
      zip.addBuffer(Buffer.from('second'), 'data/a.cpp')
    })

    await expect(extractPortableBackupArchive(archivePath, extractRoot)).rejects.toThrow(/冲突/u)
    await expect(readFile(join(extractRoot, 'data', 'A.cpp'))).rejects.toThrow()
  })
})
