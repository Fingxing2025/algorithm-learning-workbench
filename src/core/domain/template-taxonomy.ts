import { z } from 'zod'

/**
 * Versioned, local taxonomy used by template classification.
 *
 * The paths deliberately have three or four levels.  Language, implementation
 * technique and dimensionality are metadata (tags/variant), not directory
 * axes.  Keeping this list in the shared core lets Main, tests and future
 * clients use the same stable identifiers without trusting model supplied
 * paths.
 */
export const TEMPLATE_TAXONOMY_VERSION = 2 as const

const taxonomyCategorySchema = z
  .object({
    allowedTags: z.array(z.string().min(1)).max(32),
    allowedVariants: z.array(z.string().min(1)).max(16),
    aliases: z.array(z.string().min(1)).max(32),
    categoryId: z.string().regex(/^[a-z][a-z0-9.-]+$/),
    examples: z.array(z.string().min(1)).max(16),
    forbiddenTerms: z.array(z.string().min(1)).max(32),
    parentId: z
      .string()
      .regex(/^[a-z][a-z0-9.-]+$/)
      .nullable(),
    path: z.array(z.string().min(1).max(80)).min(3).max(4),
    reviewRequired: z.boolean(),
  })
  .strict()

export const canonicalTaxonomySchema = z
  .object({
    categories: z.array(taxonomyCategorySchema).min(1),
    maxDepth: z.literal(4),
    minDepth: z.literal(3),
    schemaVersion: z.literal(TEMPLATE_TAXONOMY_VERSION),
  })
  .strict()

export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>
export type CanonicalTaxonomy = z.infer<typeof canonicalTaxonomySchema>

const category = (
  categoryId: string,
  path: string[],
  parentId: string | null,
  aliases: string[],
  examples: string[],
  allowedTags: string[],
  allowedVariants: string[],
  forbiddenTerms = ['其他', '通用', '默认', '基础', '模板', '算法'],
  reviewRequired = false,
): TaxonomyCategory => ({
  allowedTags,
  allowedVariants,
  aliases,
  categoryId,
  examples,
  forbiddenTerms,
  parentId,
  path,
  reviewRequired,
})

/** Canonical categories shipped with the application. Do not reorder IDs. */
export const canonicalTaxonomy: CanonicalTaxonomy = canonicalTaxonomySchema.parse({
  categories: [
    category(
      'basic.search.binary',
      ['基础算法', '搜索', '二分查找'],
      'basic.search',
      ['搜索算法/二分查找', '查找算法/二分查找', '二分'],
      ['二分答案', 'lower_bound'],
      ['有序数组', '单调性'],
      ['答案二分', '整数二分', '实数二分'],
    ),
    category(
      'basic.search.backtracking',
      ['基础算法', '搜索', '回溯搜索'],
      'basic.search',
      ['回溯', '数独', 'DFS 回溯'],
      ['数独求解', '全排列'],
      ['状态', '约束'],
      ['位掩码', '剪枝'],
    ),
    category(
      'basic.discretization.coordinate-compression',
      ['基础算法', '离散化', '坐标压缩'],
      'basic',
      ['离散化', '坐标离散化', '坐标压缩'],
      ['排序去重', '值域压缩'],
      ['数组', '排序'],
      ['去重', 'lower_bound'],
    ),
    category(
      'basic.search',
      ['基础算法', '搜索', '搜索'],
      'basic',
      ['搜索算法', '查找算法'],
      ['深度优先搜索', '广度优先搜索'],
      ['遍历'],
      ['DFS', 'BFS'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),
    category(
      'basic.prefix',
      ['基础算法', '前缀技巧', '前缀和与差分'],
      'basic',
      ['前缀和', '差分', '前缀和与差分'],
      ['一维前缀和', '二维差分'],
      ['数组', '区间'],
      ['一维', '二维'],
    ),
    category(
      'basic.greedy',
      ['基础算法', '贪心', '经典贪心'],
      'basic',
      ['贪心算法'],
      ['区间调度', '霍夫曼编码'],
      ['排序'],
      ['区间', '排序'],
    ),
    category(
      'basic',
      ['基础算法', '通用技巧', '算法基础'],
      null,
      ['算法', '基础算法'],
      ['双指针', '滑动窗口'],
      ['复杂度'],
      ['双指针', '滑动窗口'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),

    category(
      'data-structure.tree',
      ['数据结构', '树', '树结构'],
      'data-structure',
      ['树', '树结构'],
      ['二叉树', '树状数组'],
      ['节点', '子树'],
      ['二叉树', '树状数组'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),
    category(
      'data-structure.fenwick',
      ['数据结构', '树状数组', 'Fenwick 树'],
      'data-structure.tree',
      ['树状数组', 'Fenwick', 'BIT'],
      ['单点修改区间查询', '区间修改单点查询'],
      ['数组', '前缀和'],
      ['单点修改', '区间修改'],
    ),
    category(
      'data-structure.segment-tree',
      ['数据结构', '树', '线段树'],
      'data-structure.tree',
      ['线段树', '线段树/区间修改', '线段树/区间更新'],
      ['区间修改线段树'],
      ['区间', '懒标记'],
      ['区间修改', '区间更新'],
    ),
    category(
      'data-structure.union-find',
      ['数据结构', '集合结构', '并查集'],
      'data-structure',
      ['并查集', 'DSU'],
      ['Kruskal 中的并查集'],
      ['连通性'],
      ['路径压缩', '按秩合并'],
    ),
    category(
      'data-structure.range-query.sparse-table',
      ['数据结构', '区间查询', '稀疏表'],
      'data-structure',
      ['ST 表', 'ST表', 'Sparse Table', 'RMQ'],
      ['静态区间最值'],
      ['静态数组', '幂等运算'],
      ['倍增预处理'],
    ),
    category(
      'data-structure',
      ['数据结构', '通用结构', '基础结构'],
      null,
      ['数据结构'],
      ['栈', '队列', '堆'],
      ['容器'],
      ['STL', '手写'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),

    category(
      'graph.shortest-path.single-source',
      ['图论', '最短路', '单源最短路'],
      'graph.shortest-path',
      ['最短路', '最短路径'],
      ['Dijkstra', 'Bellman-Ford'],
      ['有向图', '权图'],
      ['Dijkstra', 'Bellman-Ford', '堆优化'],
    ),
    category(
      'graph.shortest-path.all-pairs',
      ['图论', '最短路', '全源最短路'],
      'graph',
      ['Floyd', 'Floyd-Warshall', '全源最短路', '多源最短路'],
      ['Floyd 邻接矩阵'],
      ['邻接矩阵', '权图'],
      ['Floyd'],
    ),
    category(
      'graph.mst',
      ['图论', '生成树', '最小生成树'],
      'graph',
      ['最小生成树', 'MST', 'Kruskal', 'Prim'],
      ['Kruskal', 'Prim'],
      ['连通图', '权图'],
      ['Kruskal', 'Prim'],
    ),
    category(
      'graph.topological-sort',
      ['图论', '有向图', '拓扑排序'],
      'graph',
      ['拓扑排序', 'Kahn', 'Topological Sort'],
      ['Kahn 拓扑排序'],
      ['有向无环图', '入度'],
      ['Kahn', 'DFS'],
    ),
    category(
      'graph.representation.forward-star',
      ['图论', '图存储', '链式前向星'],
      'graph',
      ['链式前向星', '前向星', '邻接表'],
      ['静态邻接表'],
      ['边', '顶点'],
      ['带权', '无权'],
    ),
    category(
      'graph.tree-query.lca',
      ['图论', '树上查询', '最近公共祖先'],
      'graph.tree-query',
      ['最近公共祖先', 'LCA', '图论/树/最近公共祖先'],
      ['倍增 LCA', 'Tarjan LCA'],
      ['树'],
      ['倍增', 'Tarjan'],
    ),
    category(
      'graph.tree-query',
      ['图论', '树上查询', '树上查询'],
      'graph',
      ['树上查询', '图论/树'],
      ['树上差分'],
      ['树'],
      ['倍增', '树链剖分'],
    ),
    category(
      'graph',
      ['图论', '通用图算法', '图论基础'],
      null,
      ['图论'],
      ['拓扑排序', '强连通分量'],
      ['有向图'],
      ['Tarjan', 'Kosaraju'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),

    category(
      'string.pattern.kmp',
      ['字符串', '模式匹配', 'KMP'],
      'string.pattern',
      ['字符串算法/KMP', 'KMP'],
      ['KMP'],
      ['匹配'],
      ['前缀函数'],
    ),
    category(
      'string.pattern.ac-automaton',
      ['字符串', '模式匹配', 'AC 自动机'],
      'string.pattern',
      ['AC自动机', 'AC 自动机', 'Aho-Corasick'],
      ['多模式匹配'],
      ['文本', '字典树'],
      ['失配指针', 'BFS'],
    ),
    category(
      'string.pattern.z-function',
      ['字符串', '模式匹配', 'Z 函数'],
      'string.pattern',
      ['Z函数', 'Z 函数', 'Z-algorithm'],
      ['线性模式匹配'],
      ['文本'],
      ['最长公共前缀'],
    ),
    category(
      'string.pattern',
      ['字符串', '模式匹配', '模式匹配'],
      'string',
      ['字符串算法', '字符串/匹配'],
      ['字典树', 'AC 自动机'],
      ['文本'],
      ['KMP', 'AC 自动机'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),
    category(
      'string.trie',
      ['字符串', '字典树', 'Trie'],
      'string',
      ['Trie', '字典树', '前缀树'],
      ['前缀计数'],
      ['字符串集合', '字符集'],
      ['计数', '动态开点'],
    ),
    category(
      'string.palindrome.manacher',
      ['字符串', '回文', 'Manacher'],
      'string',
      ['Manacher', '马拉车'],
      ['最长回文子串'],
      ['文本'],
      ['奇偶中心'],
    ),
    category(
      'string.rotation.minimal',
      ['字符串', '循环同构', '最小表示法'],
      'string',
      ['最小表示法', '循环同构', '最小循环表示'],
      ['字典序最小循环移位'],
      ['文本'],
      ['双指针'],
    ),
    category(
      'string.suffix-array',
      ['字符串', '后缀结构', '后缀数组'],
      'string',
      ['后缀数组', 'Suffix Array', 'SA'],
      ['后缀排序'],
      ['文本'],
      ['倍增', 'SA-IS'],
    ),
    category(
      'string.transform.bwt',
      ['字符串', '字符串变换', 'BWT'],
      'string.transform',
      ['字符串算法/BWT', 'BWT'],
      ['Burrows-Wheeler Transform', 'BWT'],
      ['文本变换'],
      ['逆变换', 'LF-mapping'],
    ),
    category(
      'string',
      ['字符串', '通用处理', '字符串基础'],
      null,
      ['字符串算法', '字符串'],
      ['回文串', '哈希'],
      ['文本'],
      ['哈希', '回文'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),

    category(
      'dp.knapsack.01',
      ['动态规划', '背包', '01 背包'],
      'dp.knapsack',
      ['01背包', '01 背包问题'],
      ['0/1 knapsack'],
      ['容量', '价值'],
      ['滚动数组', '路径恢复'],
    ),
    category(
      'dp.knapsack.unbounded',
      ['动态规划', '背包', '完全背包'],
      'dp.knapsack',
      ['完全背包', '无限背包'],
      ['硬币兑换'],
      ['容量', '价值'],
      ['正序枚举'],
    ),
    category(
      'dp.knapsack.bounded',
      ['动态规划', '背包', '多重背包'],
      'dp.knapsack',
      ['多重背包', '有界背包'],
      ['二进制拆分背包'],
      ['容量', '价值'],
      ['二进制拆分', '单调队列'],
    ),
    category(
      'dp.knapsack.group',
      ['动态规划', '背包', '分组背包'],
      'dp.knapsack',
      ['分组背包'],
      ['每组至多选择一个'],
      ['容量', '价值'],
      ['分组转移'],
    ),
    category(
      'dp.knapsack.dependent',
      ['动态规划', '背包', '依赖背包'],
      'dp.knapsack',
      ['依赖背包', '主件附件背包'],
      ['主件附件'],
      ['容量', '价值'],
      ['组合枚举'],
    ),
    category(
      'dp.knapsack',
      ['动态规划', '背包', '背包问题'],
      'dp',
      ['背包问题', '动态规划/背包问题'],
      ['完全背包', '多重背包'],
      ['容量', '价值'],
      ['完全背包', '多重背包'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),
    category(
      'dp.sequence.lis',
      ['动态规划', '序列 DP', '最长递增子序列'],
      'dp.sequence',
      ['LIS'],
      ['LIS'],
      ['序列'],
      ['二分优化', '计数'],
    ),
    category(
      'dp',
      ['动态规划', '状态转移', '动态规划基础'],
      null,
      ['动态规划'],
      ['区间 DP', '树形 DP'],
      ['状态'],
      ['区间', '树形', '状态压缩'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),

    category(
      'math.number-theory.prime',
      ['数学', '数论', '素数与筛法'],
      'math.number-theory',
      ['素数', '筛法'],
      ['埃氏筛', '线性筛'],
      ['模运算'],
      ['埃氏筛', '线性筛'],
    ),
    category(
      'math.combinatorics.factorial-inverse',
      ['数学', '组合数学', '组合数预处理'],
      'math',
      ['组合数', '阶乘与逆元', 'C(n,k)'],
      ['模组合数'],
      ['素数模数', '阶乘'],
      ['逆元预处理'],
    ),
    category(
      'math.linear-algebra.xor-basis',
      ['数学', '线性代数', '异或线性基'],
      'math',
      ['线性基', '异或线性基', 'XOR basis'],
      ['最大子集异或和'],
      ['非负整数', '二进制'],
      ['插入', '查询'],
    ),
    category(
      'math.polynomial.ntt',
      ['数学', '多项式', 'NTT'],
      'math',
      ['NTT', '数论变换', '多项式卷积'],
      ['模多项式卷积'],
      ['模数'],
      ['蝶形合并', '位逆序'],
    ),
    category(
      'math.precision.big-integer',
      ['数学', '高精度', '大整数'],
      'math',
      ['高精度', '高精度类', '大整数'],
      ['任意精度整数运算'],
      ['整数'],
      ['加减乘除'],
    ),
    category(
      'math.number-theory',
      ['数学', '数论', '数论基础'],
      'math',
      ['数论'],
      ['欧几里得算法', '快速幂'],
      ['整数'],
      ['GCD', '快速幂'],
    ),
    category(
      'math',
      ['数学', '离散数学', '数学基础'],
      null,
      ['数学'],
      ['组合数学', '概率'],
      ['公式'],
      ['组合', '概率'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),

    category(
      'numeric.root.binary-trinary',
      ['数值计算', '方程求解', '二分与三分'],
      'numeric.root',
      ['数值计算/一维优化/三分搜索', '三分搜索', '整数三分'],
      ['整数三分', '实数三分'],
      ['精度'],
      ['整数', '实数', '三分'],
    ),
    category(
      'numeric.root',
      ['数值计算', '方程求解', '方程求解'],
      'numeric',
      ['数值计算'],
      ['牛顿迭代'],
      ['精度'],
      ['牛顿迭代'],
    ),
    category(
      'numeric',
      ['数值计算', '数值优化', '数值计算基础'],
      null,
      ['数值计算'],
      ['积分', '插值'],
      ['精度'],
      ['浮点'],
    ),

    category(
      'cpp.stl.containers',
      ['C++ 工具', '标准库', '容器与算法'],
      'cpp.stl',
      ['STL', 'C++ 工具/STL'],
      ['vector', 'map'],
      ['C++', 'STL'],
      ['vector', 'map', 'unordered'],
    ),
    category(
      'cpp.integer.int128',
      ['C++ 工具', '数值类型', '__int128'],
      'cpp',
      ['__int128', '__int128_t', '扩展整数'],
      ['128 位整数输入输出'],
      ['C++'],
      ['十进制转换'],
    ),
    category(
      'cpp.debug.memory-representation',
      ['C++ 工具', '调试工具', '内存表示'],
      'cpp',
      ['内存显示', '十六进制表示', '对象表示'],
      ['变量字节表示'],
      ['C++'],
      ['十六进制'],
    ),
    category(
      'cpp.stl',
      ['C++ 工具', '标准库', 'STL'],
      'cpp',
      ['C++ 标准库'],
      ['vector', 'priority_queue'],
      ['C++'],
      ['STL'],
    ),
    category(
      'cpp',
      ['C++ 工具', '语言特性', 'C++ 基础'],
      null,
      ['C++', 'C++ 工具'],
      ['lambda', '模板'],
      ['C++'],
      ['C++17', 'Lambda'],
      ['其他', '通用', '默认', '基础', '模板', '算法'],
      true,
    ),

    category(
      'contest.io.fast',
      ['竞赛框架', '代码组织', '快速输入输出'],
      'contest.io',
      ['快读', '快速 IO'],
      ['FastIO'],
      ['C++'],
      ['iostream', 'scanf'],
    ),
    category(
      'contest.io',
      ['竞赛框架', '代码组织', '输入输出'],
      'contest',
      ['竞赛模板'],
      ['solve 函数'],
      ['竞赛'],
      ['单文件'],
    ),
    category(
      'contest',
      ['竞赛框架', '工程组织', '竞赛基础'],
      null,
      ['竞赛框架'],
      ['main/solve 框架'],
      ['竞赛'],
      ['多测试用例'],
    ),

    category(
      'datetime.calendar.convert',
      ['日期与时间', '日历计算', '日期转换'],
      'datetime.calendar',
      ['日期计算', '时间工具'],
      ['日期转序号'],
      ['日期'],
      ['闰年'],
    ),
    category(
      'datetime.calendar',
      ['日期与时间', '日历计算', '日历基础'],
      'datetime',
      ['日期与时间'],
      ['年月日运算'],
      ['日期'],
      ['公历'],
    ),
    category(
      'datetime',
      ['日期与时间', '时间处理', '日期时间基础'],
      null,
      ['日期', '时间'],
      ['时间'],
      ['时间戳'],
      [],
    ),
  ],
  maxDepth: 4,
  minDepth: 3,
  schemaVersion: TEMPLATE_TAXONOMY_VERSION,
})

export const normalizeTaxonomyAlias = (value: string): string =>
  value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\s]/gu, character => (character === '#' ? character : ''))

const categoryById = new Map(canonicalTaxonomy.categories.map(item => [item.categoryId, item]))
const categoryByPath = new Map(
  canonicalTaxonomy.categories.map(item => [item.path.join('/'), item]),
)
// Ambiguous aliases never resolve by insertion order. Algorithm names can be
// polysemous even when only one of their meanings currently ships in taxonomy.
const ambiguousFamilyAliases = new Set(['tarjan', 'bfs', 'dfs'].map(normalizeTaxonomyAlias))
const aliasToCategoryIds = new Map<string, Set<string>>()
for (const item of canonicalTaxonomy.categories) {
  for (const alias of [item.path.join('/'), item.path.at(-1) ?? '', ...item.aliases]) {
    const key = normalizeTaxonomyAlias(alias)
    const ids = aliasToCategoryIds.get(key) ?? new Set<string>()
    ids.add(item.categoryId)
    aliasToCategoryIds.set(key, ids)
  }
}
// Explicitly known polysemy, including meanings represented by a review-only
// parent until a specific leaf is added. These are hints, never forced choices.
for (const [alias, ids] of Object.entries({
  Tarjan: ['graph', 'graph.tree-query.lca'],
  BFS: ['basic.search', 'graph.shortest-path.single-source'],
  DFS: ['basic.search', 'graph.topological-sort'],
}))
  aliasToCategoryIds.set(normalizeTaxonomyAlias(alias), new Set(ids))
export function taxonomyAliasCandidates(alias: string): string[] {
  return [...(aliasToCategoryIds.get(normalizeTaxonomyAlias(alias)) ?? [])].sort()
}
function uniqueAliasId(alias: string): string | undefined {
  if (ambiguousFamilyAliases.has(alias)) return undefined
  const ids = aliasToCategoryIds.get(alias)
  return ids?.size === 1 ? [...ids][0] : undefined
}

export interface CanonicalCategoryMatch {
  category: TaxonomyCategory
  aliasMatched: boolean
  inputPath: string[]
}

/** Resolve a model categoryId or an untrusted path through the local alias map. */
export function resolveCanonicalCategory(
  categoryId: string | undefined,
  categoryPath: string[],
): CanonicalCategoryMatch | null {
  if (categoryId) {
    const category = categoryById.get(categoryId)
    return category ? { category, aliasMatched: false, inputPath: categoryPath } : null
  }
  const direct = categoryByPath.get(categoryPath.join('/'))
  if (direct) return { category: direct, aliasMatched: false, inputPath: categoryPath }
  const id =
    uniqueAliasId(normalizeTaxonomyAlias(categoryPath.join('/'))) ??
    uniqueAliasId(normalizeTaxonomyAlias(categoryPath.at(-1) ?? ''))
  let category = id ? categoryById.get(id) : undefined
  if (!category) {
    for (let index = categoryPath.length - 1; index >= 0 && !category; index -= 1) {
      const segmentId = uniqueAliasId(normalizeTaxonomyAlias(categoryPath[index]!))
      category = segmentId ? categoryById.get(segmentId) : undefined
    }
  }
  return category ? { category, aliasMatched: true, inputPath: categoryPath } : null
}

/** Resolve a directory (which may be only a partial category chain) by its
 * final known alias. Used by the read-only audit; returns null for unknown
 * free-form folders so the audit remains conservative. */
export function resolveCanonicalDirectory(directoryPath: string): CanonicalCategoryMatch | null {
  const segments = directoryPath.split('/').filter(Boolean)
  const direct = resolveCanonicalCategory(undefined, segments)
  if (direct) return direct
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const match = resolveCanonicalCategory(undefined, [segments[index]!])
    if (match) return match
  }
  return null
}

/** Resolve a stage-A algorithm fact only when it names a known taxonomy alias.
 * This deliberately does not attempt fuzzy matching: the caller may safely use
 * the result to replace a review-only fallback selected during stage B. */
export function resolveCanonicalAlgorithmFamily(
  algorithmFamily: string,
): CanonicalCategoryMatch | null {
  const normalizedFamily = normalizeTaxonomyAlias(algorithmFamily)
  if (!normalizedFamily) return null
  const categoryId = uniqueAliasId(normalizedFamily)
  const category = categoryId ? categoryById.get(categoryId) : undefined
  return category ? { category, aliasMatched: true, inputPath: [algorithmFamily] } : null
}

export function getCanonicalCategory(categoryId: string): TaxonomyCategory | null {
  return categoryById.get(categoryId) ?? null
}

export function taxonomyContext(): {
  schemaVersion: typeof TEMPLATE_TAXONOMY_VERSION
  categories: Array<
    Pick<
      TaxonomyCategory,
      | 'categoryId'
      | 'path'
      | 'aliases'
      | 'examples'
      | 'allowedTags'
      | 'allowedVariants'
      | 'reviewRequired'
    >
  >
} {
  return {
    categories: canonicalTaxonomy.categories.map(
      ({ categoryId, path, aliases, examples, allowedTags, allowedVariants, reviewRequired }) => ({
        allowedTags,
        allowedVariants,
        aliases,
        categoryId,
        examples,
        path,
        reviewRequired,
      }),
    ),
    schemaVersion: canonicalTaxonomy.schemaVersion,
  }
}

export function isForbiddenTaxonomyPath(categoryPath: string[]): boolean {
  const forbidden = new Set(['其他', '通用', '默认', '基础', '模板'])
  return categoryPath.some(segment => forbidden.has(segment.trim()))
}

export interface BatchCategoryClassification {
  algorithmFamily?: string
  categoryId?: string | null
  categoryPath: string[]
  confidence: number
  needsReview?: boolean
  reviewReasons?: string[]
}

/** Keep each source proposal intact. Self-reported confidence cannot decide a
 * cross-file conflict, and shared fallback IDs must never become write keys. */
export function reconcileBatchCategories<T extends BatchCategoryClassification>(
  items: T[],
): Array<T & Pick<BatchCategoryClassification, 'needsReview' | 'reviewReasons'>> {
  const groups = new Map<string, number[]>()
  items.forEach((item, index) => {
    const family =
      resolveCanonicalAlgorithmFamily(item.algorithmFamily ?? '')?.category.categoryId ??
      normalizeTaxonomyAlias(item.algorithmFamily ?? '')
    if (!family) return
    groups.set(family, [...(groups.get(family) ?? []), index])
  })
  const disputedIndices = new Set<number>()
  for (const indices of groups.values()) {
    const choices = new Set(
      indices.map(index => {
        const item = items[index]!
        return item.categoryId ?? item.categoryPath.join('/')
      }),
    )
    if (choices.size > 1) indices.forEach(index => disputedIndices.add(index))
  }
  return items.map((item, index) =>
    disputedIndices.has(index)
      ? {
          ...item,
          needsReview: true,
          reviewReasons: [...new Set([...(item.reviewReasons ?? []), 'family-disagreement'])],
        }
      : item,
  )
}
