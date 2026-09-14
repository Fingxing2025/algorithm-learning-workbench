import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import { loadDataset, sha256 } from './fixture-io.mjs'

const makeManifest = sourceHash => ({
  baseImplementationCount: 1,
  categories: [{ categoryId: 'basic.search.binary', family: 'basic' }],
  createdAt: '2026-09-14T00:00:00.000Z',
  datasetId: 'small-security-fixture',
  description: 'Small fixture used to verify secure source loading.',
  labelStatus: 'provisional-ai-drafted-unreviewed',
  sampleCount: 1,
  samples: [
    {
      baseImplementationId: 'binary-base',
      batchId: 'development-canonical',
      family: 'basic',
      fileName: 'binary.cpp',
      gold: {
        ambiguity: 'low',
        kind: 'single',
        primaryCategoryId: 'basic.search.binary',
      },
      pairedSampleId: null,
      sampleId: 'binary-canonical',
      sourcePath: 'sources/binary-canonical.cpp',
      sourceSha256: sourceHash,
      split: 'development',
      variant: 'canonical',
    },
  ],
  schemaVersion: 1,
  taxonomyVersion: 2,
})

test('loads a parsed regular source confined to the fixture sources directory', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'classification-fixture-'))
  try {
    const source = 'int main() { return 0; }\n'
    await mkdir(resolve(temporaryRoot, 'sources'))
    await writeFile(resolve(temporaryRoot, 'sources/binary-canonical.cpp'), source, 'utf8')
    await writeFile(
      resolve(temporaryRoot, 'manifest.json'),
      JSON.stringify(makeManifest(sha256(source))),
      'utf8',
    )

    const dataset = await loadDataset(temporaryRoot)
    assert.equal(dataset.sources.get('sources/binary-canonical.cpp'), source)
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})

test('rejects a source symlink before reading its target', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'classification-fixture-'))
  const externalRoot = await mkdtemp(resolve(tmpdir(), 'classification-outside-'))
  try {
    const source = 'int main() { return 0; }\n'
    const externalPath = resolve(externalRoot, 'outside.cpp')
    await mkdir(resolve(temporaryRoot, 'sources'))
    await writeFile(externalPath, source, 'utf8')
    await symlink(externalPath, resolve(temporaryRoot, 'sources/binary-canonical.cpp'))
    await writeFile(
      resolve(temporaryRoot, 'manifest.json'),
      JSON.stringify(makeManifest(sha256(source))),
      'utf8',
    )

    await assert.rejects(loadDataset(temporaryRoot), /cannot be a symbolic link/u)
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
    await rm(externalRoot, { force: true, recursive: true })
  }
})
