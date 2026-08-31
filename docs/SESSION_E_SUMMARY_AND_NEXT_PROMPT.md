# Session E 总结与下一 Session 启动提示

- 日期：2026-07-19
- 主题：大型工作区性能、增量索引与后台任务
- 开发基线：`0ef1afa docs: record native template close fix`
- 实现提交：`1527ff4 feat: scale workspace indexing and browsing`
- 结束提交：本文所在文档提交
- 分支：`main`
- 远程：未推送
- 版本：`0.1.2`
- 受保护文件：`.codex/config.toml` 未修改；`问题反馈.txt` 保持未跟踪，二者均未暂存或提交

## 1. 结论

Session E 已完成。应用现在用版本化增量索引、Main 后台任务、可取消原子发布、键集分页和大列表虚拟化承载 1k/5k/10k 模板及大量题目/图片元数据/关系，不再把静默固定截断描述为完整结果。小工作区继续使用原生题目列表 DOM，Session D 的键盘、焦点、滚轮、原生滚动条、1024×640、200% 和减少动效契约完整通过。

最终证据是 macOS arm64 本地结果，不代表 Windows 实机。Session E 没有重新打包，也没有复用 Session C/D 的旧候选摘要；当前 `release/mac-arm64/算法学习工作台.app` 仍是此前目录包。

## 2. 本地提交

从基线 `0ef1afa` 起：

1. `2bd0b9e test: establish large workspace performance baseline`
2. `9d19c74 docs: decide session e performance architecture`
3. `1527ff4 feat: scale workspace indexing and browsing`
4. 本文所在提交：同步性能、架构、质量门禁、项目状态和下一 Session 交接

所有提交均为本地提交；没有推送远程仓库。

## 3. 数据结构、migration 与索引

新增 `drizzle/0006_performance_indexing.sql`：

- `workspaces.scan_stats_json`
- `templates.content_hash`
- `templates.file_identity`
- `templates.change_token`
- `templates.normalized_content_hash`
- `templates.similarity_signature_json`
- `templates.index_version`
- 模板路径/内容哈希、题目更新时间、文件计划/执行历史复合索引

当前索引版本为 `1`。旧行允许索引字段为空，下一次扫描惰性补全；索引版本不匹配或强制完整扫描时重建。migration 失败不记录 migration ID，扫描失败/取消不发布候选，因此上一完整索引继续可用。

`.awb-backup` 格式仍为 `v1`，会自然备份完整 SQLite；没有新增独立索引文件、备份格式或系统权限。

## 4. 增量扫描与稳定 ID

- 快速变化判断使用受控相对路径、大小、文件身份和纳秒级 `mtimeNs/ctimeNs`；内容真实性仍使用完整 SHA-256，不只依赖 mtime。
- 首次或真实变化扫描同步生成规范化 SHA-256 和受限相似度签名；无变化文件复用持久化索引。
- 每次读取前后复检状态；符号链接、越界、读取失败或扫描中途变化会安全拒绝发布。
- 完整候选形成后才在一个 SQLite 事务中差量发布新增、修改、移动和删除状态。
- 应用外移动优先匹配唯一文件身份，其次匹配双方唯一的“内容哈希 + 大小”；重复或歧义不猜测。
- 移动继承稳定模板 ID，元数据与题目关系保持；删除只把旧模板标记为不可用，不删除关系或用户源码。

## 5. 后台任务、进度与取消

新增 Main `BackgroundTaskRegistry`，首批任务：

- `workspace-scan`
- `workspace-audit`

任务状态仅驻留 Main 进程，包含阶段、已处理数、总数/未知、状态和安全结果摘要。同工作区同类型任务复用，不并发破坏索引。Renderer 通过命名 Preload/IPC 启动、轮询和取消，不接触原始 IPC、文件系统、SQLite 或 `AbortController`。

取消后 Renderer 立即恢复可操作；Main 停止后续批次并丢弃迟到结果。应用退出时先取消并等待任务终止，再关闭 SQLite。

## 6. 分页、虚拟化与搜索

- 模板：工作区快照首批最多 500 条；顺序 `(relative_path ASC, id ASC)`。加载更多、全局搜索、树搜索和 ID 直查均走 Main。
- 题目：首批 100 条；顺序 `(updated_at DESC, id DESC)`。详情按 UUID 直查；搜索返回全库匹配计数。
- 模板关联：按模板 ID 查询最小题目摘要页，不装配全量题面、图片和关系。
- 文件计划/执行历史：顺序 `(created_at DESC, id DESC)`，显示已加载/总数和继续加载入口。
- 题目列表超过 100 条时使用 TanStack 虚拟化；不超过 100 条时保留原生 DOM，避免改变小工作区滚动行为。
- 所有分页上限都公开 `processedCount`、`totalCount`、`truncatedReason` 和 `nextAction`；游标由 Main 解码校验，Renderer 不提交 OFFSET、SQL 或任意排序字段。

## 7. 审计与 AI 查询

- 完全重复按规范化 SHA-256 分组。
- 高相似审计先用持久化签名 band 生成候选，再只对候选读取源码并计算精确 Jaccard；候选过多、索引缺失或建议超限都会显示原因与下一步。
- 模板元数据改为批量查询；题目关系使用聚合 SQL，不再为 AI 上下文全量装配题目正文或逐模板 N+1 查询。
- Provider 外发字符、隐私预览和文件计划安全 Schema 未扩大。

## 8. 最终性能

机器：MacBook Neo（Mac17,5），Apple A18 Pro 6 核，8 GiB，macOS 26.5.2 arm64，Node 24.18.0，Electron 43.1.0。每项 5 次；Electron 启动为进程冷启动，未特权清空操作系统文件缓存。

| 规模 |    启动 P50/P95 | 完整重扫 P50/P95 | 无变化重扫 P50/P95 | 搜索 P50/P95 | 审计 P50/P95 | 取消 P50/P95 |
| ---: | --------------: | ---------------: | -----------------: | -----------: | -----------: | -----------: |
|   1k | 2016.35/2856.49 |    220.84/274.62 |      127.79/133.73 |    0.87/1.76 |   8.54/10.45 |    0.29/0.87 |
|   5k | 1702.91/1936.51 |   815.51/1059.75 |      326.12/332.25 |    3.51/4.58 |  42.28/48.01 |    0.35/1.41 |
|  10k | 1923.12/2349.86 |  1764.57/1875.77 |     805.45/1045.77 |    6.69/8.55 |  78.81/93.45 |    0.27/0.59 |

10k 额外结果：题目首批 P50/P95 3.09/13.70 ms，详情 0.18/0.20 ms，AI 候选 135.84/151.81 ms，启动进程树 RSS 峰值 572.97 MiB。无变化重扫 `hashed = 0`、`reused = unchanged = 10,000`；强制完整重扫 `hashed = modified = 10,000`。

完整表和优化前对比见 `docs/PERFORMANCE_BASELINE.md`。原始输出位于被 Git 忽略的 `output/performance/session-e-session-e-final.{json,md}`。

## 9. 自动化与截图

### `npm run check`

- TypeScript：通过
- ESLint：0 warnings
- Prettier：通过
- Vitest：28 个文件、201 项通过
- 发布脚本：3 项通过

### `npm run test:e2e`

- 54 项常规 Electron E2E 通过
- 2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过
- 最终全量重跑约 2.7 分钟
- 额外连续 3 次通过题目列表/详情/编辑器的滚轮与原生滚动条用例

Session E E2E 真实遍历 644 模板、126 题、110 条单模板关系、105 计划和 105 执行记录；各集合 ID 唯一，首批之外模板可搜索定位。增量 E2E 覆盖取消、mtime 恢复后的同长度改写、移动、删除、符号链接和源码不变。

新增截图：

- `output/playwright/session-e-template-page-1440x900-light.png`
- `output/playwright/session-e-template-search-1440x900-light.png`
- `output/playwright/session-e-problem-page-1024x640-light.png`
- `output/playwright/session-e-problem-page-1024x640-dark.png`
- `output/playwright/session-e-problem-page-1280x720-reduced-motion.png`

Session D 的 1440×900、1280×720、1024×640、亮暗主题和 200% 完整矩阵继续由全量 E2E 通过。

## 10. userData 与平台结论

### 全新 userData

从 migration 0000 顺序升级到 0006；无旧项目、预置模板或个人配置时可以创建空白工作区并开始使用。

### 已有 V2 userData

旧 stage-1 数据库和已有结构化题目数据库均由真实 Electron migration E2E 原位升级；不删除数据库，不移动外部模板源码。旧索引字段在下一次扫描补全。

### 异常中断

扫描取消、读取中途变化或事务失败保留上一完整索引；`scan_stats_json` 不更新，用户源码、模板元数据和题目关系不修改。Session A 的备份/恢复/隔离/中断恢复 E2E 全部继续通过。

### 平台

本次性能和 UI 证据为 macOS arm64。Windows x64 只有既有 CI 构建能力，没有真实 Windows 大工作区、取消、NSIS 安装或升级证据。macOS 正式签名/notarization 仍未完成。

## 11. 已知风险与下一步

- 首次扫描因完整哈希、相似度签名和读取前后复检比旧实现更重；这是安全索引成本。
- `App.tsx`、`TemplateManagementService` 和多个工作区页面继续偏大；Session F 应做行为保持拆分，不改变已验证的 IPC/schema。
- 模板树首版按路径分页；用户需要跨未加载目录定位时依赖 Main 搜索，这是有意设计，不支持任意“第 N 页”。
- Windows 实机、高对比模式、Narrator 和签名安装仍等待外部条件。

## 12. 下一 Session 可直接复制提示词

```text
继续开发“智能算法学习助手 V2”。

工作目录：
/Users/ffxx/Desktop/项目/智能算法学习助手-v2

本 Session：
Session F：行为保持的代码健康与文档发布候选

开始前完整阅读：
- AGENTS.md
- docs/PROJECT_STATUS_AND_HANDOFF.md
- docs/SESSION_E_SUMMARY_AND_NEXT_PROMPT.md
- docs/ARCHITECTURE.md
- docs/QUALITY_GATES.md
- docs/V2_PRODUCT_SPEC.md
- docs/IMPLEMENTATION_PLAN.md

先执行 git status、git log -5 --oneline，以 Session E 结束提交为基线。不得回退 Session A/B/C/D/E；`.codex/config.toml` 与 `问题反馈.txt` 不得覆盖、格式化、暂存或提交；旧项目只读；不推送远程。

目标：
1. 行为保持地拆分 src/renderer/src/App.tsx、src/main/services/template-management-service.ts 和大型页面组件。
2. 优先抽取已有领域 hook/service/selector，不改变产品模块、视觉系统、SQLite schema、IPC 或安全权限。
3. 为抽取逻辑补单元测试，保持 201 项 Vitest、54 项常规 Electron E2E、Session E 性能基准和 Session D 可访问性门禁。
4. 同步 README、USER_GUIDE、CHANGELOG、ARCHITECTURE、QUALITY_GATES 与项目状态，区分源码版本、最后目录包和正式签名状态。
5. 如确需改变数据库、IPC、后台任务或索引协议，先新增 ADR 和 migration；不要把结构重构与协议升级混在同一提交。

最低验收：
- npm run check 通过并报告实际测试数。
- npm run test:e2e 全量通过。
- npm run benchmark:performance 至少做 1k smoke；若影响扫描、查询或渲染，再重跑完整 1k/5k/10k。
- 1024×640、1280×720、1440×900、200%、亮暗主题、减少动效和全键盘契约不回退。
- 全新 userData、已有 V2 userData 和旧 schema 原位升级继续通过。
- 不重新打包，除非明确需要；若打包只能使用 npm run package:dir，并单独运行 2 项 packaged smoke，不复用旧候选摘要。

交付时生成 docs/SESSION_F_SUMMARY_AND_NEXT_PROMPT.md，列出基线/结束提交、所有本地提交、未提交文件、测试、截图、兼容性、风险和下一步。明确未推送，并确认受保护文件已排除。
```
