import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  createClassificationServiceInputExport,
  scoreClassificationPredictions,
} from '../../src/core/evaluation/classification-evaluation.ts'
import { loadDataset, loadJson } from './fixture-io.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const defaultFixtureRoot = resolve(repositoryRoot, 'tests/fixtures/classification-evaluation')

const argumentValue = (name, fallback = null) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}

const findCompiler = () => {
  for (const compiler of ['clang++', 'g++']) {
    const result = spawnSync(compiler, ['--version'], { encoding: 'utf8' })
    if (result.status === 0) return compiler
  }
  throw new Error('No clang++ or g++ compiler is available for fixture syntax checks.')
}

const validate = async fixtureRoot => {
  const { manifest } = await loadDataset(fixtureRoot)
  const compiler = findCompiler()
  const failures = []
  for (const sample of manifest.samples) {
    const sourcePath = resolve(fixtureRoot, sample.sourcePath)
    const result = spawnSync(compiler, ['-std=c++17', '-fsyntax-only', sourcePath], {
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      failures.push({ sampleId: sample.sampleId, stderr: result.stderr.trim() })
    }
  }
  if (failures.length > 0) {
    throw new Error(`C++ syntax validation failed:\n${JSON.stringify(failures, null, 2)}`)
  }
  const baseBySplit = Object.groupBy(
    [...new Map(manifest.samples.map(sample => [sample.baseImplementationId, sample])).values()],
    sample => sample.split,
  )
  console.log(
    JSON.stringify(
      {
        baseImplementationCount: manifest.baseImplementationCount,
        compiler,
        compiledTranslationUnits: manifest.sampleCount,
        developmentBaseCount: baseBySplit.development?.length ?? 0,
        fragmentCount: 0,
        holdoutBaseCount: baseBySplit.holdout?.length ?? 0,
        labelStatus: manifest.labelStatus,
        sampleCount: manifest.sampleCount,
        taxonomyVersion: manifest.taxonomyVersion,
      },
      null,
      2,
    ),
  )
}

const prepare = async (fixtureRoot, outputPath) => {
  if (!outputPath) throw new Error('prepare requires --output <path>')
  const { manifest, sources } = await loadDataset(fixtureRoot)
  const serviceInput = createClassificationServiceInputExport(manifest, sources)
  await writeFile(resolve(outputPath), `${JSON.stringify(serviceInput, null, 2)}\n`, 'utf8')
  console.log(
    JSON.stringify(
      {
        datasetId: serviceInput.datasetId,
        goldFieldsExported: false,
        inputCount: serviceInput.inputs.length,
        outputPath: resolve(outputPath),
        providerInvoked: false,
      },
      null,
      2,
    ),
  )
}

const score = async (fixtureRoot, predictionsPath, outputPath) => {
  if (!predictionsPath) throw new Error('score requires --predictions <path>')
  const { manifest } = await loadDataset(fixtureRoot)
  const predictionExport = await loadJson(resolve(predictionsPath))
  const report = scoreClassificationPredictions(manifest, predictionExport)
  if (outputPath) {
    await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  console.log(JSON.stringify(report, null, 2))
}

const command = process.argv[2]
const fixtureRoot = resolve(argumentValue('--fixtures', defaultFixtureRoot))

try {
  if (command === 'validate') await validate(fixtureRoot)
  else if (command === 'prepare') await prepare(fixtureRoot, argumentValue('--output'))
  else if (command === 'score') {
    await score(fixtureRoot, argumentValue('--predictions'), argumentValue('--output'))
  } else {
    throw new Error(
      'Usage: cli.mjs validate | prepare --output <path> | score --predictions <path> [--output <path>]',
    )
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
