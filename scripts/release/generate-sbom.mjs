import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ensureParentDirectory,
  getReleasePaths,
  npmCommand,
  parseReleaseOptions,
  readProjectFacts,
  runCommand,
} from './release-lib.mjs'

export async function generateSbom(options = parseReleaseOptions()) {
  const facts = await readProjectFacts()
  const paths = getReleasePaths(facts, options)
  const outputPath = join(paths.candidateDirectory, 'sbom.cyclonedx.json')
  const result = await runCommand(
    npmCommand(),
    ['sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev'],
    { capture: true },
  )
  const sbom = JSON.parse(result.stdout)
  if (sbom.bomFormat !== 'CycloneDX' || sbom.metadata?.component?.version !== facts.version) {
    throw new Error('npm 生成的 CycloneDX SBOM 与当前版本不一致。')
  }
  await ensureParentDirectory(outputPath)
  await writeFile(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8')
  console.log(`已生成 CycloneDX SBOM：${outputPath}`)
  return outputPath
}

await generateSbom()
