import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { format } from 'prettier'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const fixtureRoot = resolve(repositoryRoot, 'tests/fixtures/classification-evaluation')
const manifest = JSON.parse(await readFile(resolve(fixtureRoot, 'manifest.json'), 'utf8'))

const predictions = manifest.samples.map(sample => ({
  batchId: sample.batchId,
  categoryId: sample.gold.kind === 'single' ? sample.gold.primaryCategoryId : null,
  confidence: sample.gold.kind === 'single' ? 0.99 : 0.5,
  decision: sample.gold.kind === 'single' ? 'classify' : 'review',
  sampleId: sample.sampleId,
  sourceSha256: sample.sourceSha256,
}))

const output = {
  datasetId: manifest.datasetId,
  predictions,
  run: {
    classificationServiceVersion: 'mock-pipeline-only',
    completedAt: '2026-09-14T00:00:00.000Z',
    mode: 'mock',
    model: null,
    promptVersion: 'mock-no-prompt',
    provider: null,
    runId: 'mock-perfect-pipeline',
  },
  schemaVersion: 1,
  taxonomyVersion: manifest.taxonomyVersion,
}

await writeFile(
  resolve(fixtureRoot, 'mock-perfect.predictions.json'),
  await format(JSON.stringify(output), { parser: 'json', printWidth: 100 }),
  'utf8',
)
console.log(
  JSON.stringify({ predictionCount: predictions.length, providerInvoked: false }, null, 2),
)
