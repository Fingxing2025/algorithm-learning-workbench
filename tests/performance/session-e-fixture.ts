import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AppDatabase } from '../../src/main/database/database'
import type { TemplateSummary } from '../../src/core/contracts/workspace'

const categories = [
  ['图论', '最短路', '单源算法'],
  ['Data Structures', 'Trees', 'Balanced Search'],
  ['文字列アルゴリズム', 'パターン照合', '前処理'],
  ['Алгоритмы', 'Графы', 'Потоки'],
  ['Dynamic Programming', 'State Compression', 'Transitions'],
  ['数学', '数论', '模运算'],
  ['Geometry', 'Convex Hull', 'Robust Predicates'],
  ['검색', '오프라인 쿼리', '분할 정복'],
] as const

const extensions = ['.cpp', '.py', '.rs', '.java', '.ts'] as const
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function deterministicUuid(prefix: number, index: number): string {
  return `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${index
    .toString(16)
    .padStart(12, '0')}`
}

function sourceFor(index: number, extension: string): string {
  const family = Math.floor(index / 10) % 37
  const variant = index % 10
  const body = [
    `family_${family}`,
    'priority_queue distance relax edge graph',
    'segment tree range update query lazy propagation',
    'dynamic programming transition state invariant',
  ]
  if (index % 101 === 0) return `// duplicate fixture\n${body.join(' ')}\n`
  if (index % 101 === 1) return `/* duplicate fixture */ ${body.join(' ')}\n`
  const suffix = variant === 0 ? 'baseline' : `variant_${variant}`
  if (extension === '.py')
    return `def ${body[0]}_${suffix}():\n    return "${body.slice(1).join(' ')}"\n`
  return `// deterministic fixture ${family}\nvoid ${body[0]}_${suffix}() { /* ${body
    .slice(1)
    .join(' ')} */ }\n`
}

function fileNameFor(index: number, extension: string): string {
  if (index % 997 === 0) {
    return `跨语言_非常长但受控的模板文件名_${index}_${'long-name-'.repeat(8)}fixture${extension}`
  }
  if (index % 211 === 0) return `高相似源码 副本 ${index}${extension}`
  return `template_${index.toString().padStart(5, '0')}${extension}`
}

export interface PerformanceFixture {
  imageCount: number
  problemCount: number
  relationCount: number
  templateCount: number
  workspacePath: string
}

export async function createPerformanceWorkspace(
  rootPath: string,
  templateCount: number,
): Promise<PerformanceFixture> {
  const writes: Array<Promise<void>> = []
  for (let index = 0; index < templateCount; index += 1) {
    const category = categories[index % categories.length]!
    const extension = extensions[index % extensions.length]!
    const chain = index % 173 === 0 ? ['single', 'child', 'chain', `level-${index % 7}`] : []
    const directory = join(rootPath, ...category, ...chain, `bucket-${index % 53}`)
    const target = join(directory, fileNameFor(index, extension))
    writes.push(
      (async () => {
        await mkdir(directory, { recursive: true })
        await writeFile(target, sourceFor(index, extension), { encoding: 'utf8', flag: 'wx' })
      })(),
    )
    if (writes.length >= 64) await Promise.all(writes.splice(0))
  }
  await Promise.all(writes)
  await writeFile(join(rootPath, 'README.md'), '# deterministic performance fixture\n')

  const problemCount = Math.max(200, Math.floor(templateCount / 5))
  const imageCount = Math.floor(problemCount / 10)
  return {
    imageCount,
    problemCount,
    relationCount: problemCount * 2,
    templateCount,
    workspacePath: rootPath,
  }
}

export async function seedPerformanceDatabase(args: {
  database: AppDatabase
  fixture: PerformanceFixture
  templates: TemplateSummary[]
  userDataPath: string
  workspaceId: string
}): Promise<void> {
  const { client } = args.database
  const insertMetadata = client.prepare(
    `INSERT INTO template_metadata
      (template_id, tags_json, time_complexity, space_complexity, solves, constraints_text,
       prerequisites, common_mistakes, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  client.transaction(() => {
    for (let index = 0; index < args.templates.length; index += 3) {
      const template = args.templates[index]!
      insertMetadata.run(
        template.id,
        JSON.stringify(['图论', '性能夹具', `bucket-${index % 53}`, '多语言']),
        'O(n log n)',
        'O(n)',
        '确定性的本地性能夹具用途描述',
        'n <= 200000，输入规模受控',
        '基础数据结构与复杂度分析',
        '注意边界、重复状态和溢出',
        '',
        '2026-07-19T00:00:00.000Z',
      )
    }
  })()

  const insertProblem = client.prepare(
    `INSERT INTO problems
      (id, title, platform, problem_code, url, difficulty, tags_json, statement, notes, status,
       created_at, updated_at, ai_summary, analysis_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertRelation = client.prepare(
    `INSERT INTO template_problem_relations
      (problem_id, template_id, relation_type, source, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertImage = client.prepare(
    `INSERT INTO problem_images
      (id, problem_id, relative_path, media_type, original_name, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const imageWrites: Array<Promise<void>> = []
  client.transaction(() => {
    for (let index = 0; index < args.fixture.problemCount; index += 1) {
      const problemId = deterministicUuid(0x10000000, index + 1)
      const timestamp = new Date(Date.UTC(2026, 6, 19, 0, 0, index % 60)).toISOString()
      insertProblem.run(
        problemId,
        `确定性题目 ${index.toString().padStart(5, '0')}`,
        ['洛谷', 'Codeforces', 'AtCoder'][index % 3],
        `FIX-${index}`,
        null,
        ['easy', 'medium', 'hard'][index % 3],
        JSON.stringify(['性能', '图论', '数据结构', `组-${index % 17}`]),
        `这是不含真实用户内容的确定性题面 ${index}。`.repeat(8),
        'fixture note',
        ['unattempted', 'attempting', 'solved'][index % 3],
        timestamp,
        timestamp,
        'fixture summary',
        JSON.stringify({
          algorithmSignals: ['graph', 'search'],
          constraints: ['deterministic'],
          edgeCases: [],
          examples: [],
          inputDescription: '',
          outputDescription: '',
        }),
      )
      for (let relationIndex = 0; relationIndex < 2; relationIndex += 1) {
        const template = args.templates[(index * 7 + relationIndex * 13) % args.templates.length]!
        insertRelation.run(
          problemId,
          template.id,
          relationIndex === 0 ? 'used' : 'alternative',
          'manual',
          '',
          timestamp,
          timestamp,
        )
      }
      if (index < args.fixture.imageCount) {
        const imageId = deterministicUuid(0x20000000, index + 1)
        const relativePath = `problem-images/${problemId}/${imageId}.png`
        insertImage.run(
          imageId,
          problemId,
          relativePath,
          'image/png',
          `fixture-${index}.png`,
          tinyPng.byteLength,
          timestamp,
        )
        const imageDirectory = join(args.userDataPath, 'problem-images', problemId)
        imageWrites.push(
          (async () => {
            await mkdir(imageDirectory, { recursive: true })
            await writeFile(join(imageDirectory, `${imageId}.png`), tinyPng, { flag: 'wx' })
          })(),
        )
      }
    }
  })()
  await Promise.all(imageWrites)

  const digest = createHash('sha256')
    .update(String(args.fixture.templateCount))
    .update(String(args.fixture.problemCount))
    .digest('hex')
  client
    .prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)')
    .run('performance_fixture_digest', digest)
}
