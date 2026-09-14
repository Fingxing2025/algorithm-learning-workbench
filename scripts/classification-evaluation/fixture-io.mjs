import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

import { validateClassificationEvaluationDataset } from '../../src/core/evaluation/classification-evaluation.ts'

export const sha256 = content => createHash('sha256').update(content, 'utf8').digest('hex')

export const loadJson = async path => JSON.parse(await readFile(path, 'utf8'))

export const loadDataset = async fixtureRoot => {
  const rawManifest = await loadJson(resolve(fixtureRoot, 'manifest.json'))
  const parsedManifest = validateClassificationEvaluationDataset(rawManifest)
  const canonicalSourceRoot = await realpath(resolve(fixtureRoot, 'sources'))
  const sources = new Map()
  for (const sample of parsedManifest.samples) {
    const candidatePath = resolve(fixtureRoot, sample.sourcePath)
    const fileStatus = await lstat(candidatePath)
    if (fileStatus.isSymbolicLink()) {
      throw new Error(`Fixture source cannot be a symbolic link: ${sample.sourcePath}`)
    }
    if (!fileStatus.isFile()) {
      throw new Error(`Fixture source is not a regular file: ${sample.sourcePath}`)
    }
    const canonicalPath = await realpath(candidatePath)
    if (
      canonicalPath !== canonicalSourceRoot &&
      !canonicalPath.startsWith(`${canonicalSourceRoot}${sep}`)
    ) {
      throw new Error(`Fixture source escapes the sources directory: ${sample.sourcePath}`)
    }
    sources.set(sample.sourcePath, await readFile(canonicalPath, 'utf8'))
  }
  return {
    manifest: validateClassificationEvaluationDataset(parsedManifest, { sha256, sources }),
    sources,
  }
}
