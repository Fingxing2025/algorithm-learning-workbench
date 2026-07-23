# 项目状态、审计与多 Session 交接

- 更新日期：2026-07-23
- 完整 AI 模板目录 Session 原始起点：`89dbde315457e95be0ec8198c7830c3c69b10288`
- 并发 Windows 发布工作结束后的实际提交基座：`95a7795a8aac249714f4f6a3ddecd4e3066cdf87`
- 完整 AI 模板目录 ADR 提交：`ac69d14 docs: decide complete ai template catalog`
- 完整 AI 模板目录源码提交：`720fca6 feat: provide complete template catalog to ai tasks`
- 总体文件 AI 实际基座：`fabb334 fix: preserve Windows asar extraction paths`
- 总体文件 AI ADR 提交：`ce3b999 docs: define workspace ai preview snapshots`
- 总体文件 AI 完整目录提交：`700f342 feat: remove workspace catalog count limits`
- 总体文件 AI 快照提交：`b1ccd6a feat: lock file plan request snapshots`
- 总体文件 AI 审查收尾提交：`327614a test: finalize file plan review safeguards`
- 总体文件 AI 门禁修复提交：`1174131 fix: pass file plan quality gates`
- Session E 实际开发基线：`0ef1afa docs: record native template close fix`
- Session F 第一切片实现结束提交：`1a153bf refactor: extract workspace route renderer`
- Session F 第二切片代码结束提交：`9c195b6 refactor: split template management plan services`
- Session F 第三切片代码结束提交：`75aad5f refactor: split ai provider workspace`
- Session F 第四切片代码结束提交：`ee52a21 refactor: split problem analysis relations`
- Session F 第五切片特征测试提交：`b2698d4 test: characterize problem workspace details`
- Session F 第五切片代码结束提交：`0b13ff2 refactor: split problem workspace`
- Session F 第六切片特征测试提交：`be85ed6 test: characterize file management history`
- Session F 第六切片代码结束提交：`e09825a refactor: split file management history panel`
- Session F 第七切片特征测试提交：`a28bf3c test: characterize file plan review`
- Session F 第七切片代码结束提交：`e403e44 refactor: split file plan review panel`
- Session F 第八切片特征测试提交：`fecfdfc test: characterize file management audit`
- Session F 第八切片代码结束提交：`a0254a9 refactor: split file management audit panel`
- Session F 第九切片特征测试提交：`361a7b6 test: characterize data backup restore workspace`
- Session F 第九切片代码结束提交：`85064b6 refactor: split data backup restore panel`
- Session F 第十切片特征测试提交：`289e665 test: characterize interrupted recovery workspace`
- Session F 第十切片代码结束提交：`436ff70 refactor: split interrupted recovery panel`
- Session F 收尾提交：`39421c0 docs: close session f development`
- unsigned beta 候选来源提交：`39421c0329c463657cb43c4e552949e48bee93c9`（与收尾提交相同）
- 源码版本：`0.1.2` 开发快照
- 产品阶段：0.1.2 功能闭环、Session A/B、九项 Bugfix、Session C 发布候选工程、Session D UX/可访问性、Session E 大型工作区性能与 Session F 代码健康收尾均完成；随后针对明确产品需求完成新建模板、题目分析和总体文件管理三个 AI 入口的完整模板目录、可信预览与预算改进。历史 unsigned beta 仍来自 `39421c0`，本 Session 没有重新打包或推送

## 0. 新阶段入口

本阶段基于 0.1.2 功能冻结基线完成发布可信度收尾。后续不再横向增加 AI 页面、临时补丁或维护性拆分；只有真实 Bug、用户反馈或发布门禁触发时才重新开启工程任务。

当前状态：**Session A：数据可靠性与恢复、Session B：AI 稳定性与兼容矩阵、九项 Bugfix Session、Session C：可审计发布候选工程、Session D：UX/可访问性、Session E：大型工作区性能与 Session F 代码健康收尾均已完成。Session F 的十个行为保持切片仍然冻结；2026-07-23 的重新开发由明确的 AI 完整目录产品需求触发，先覆盖新建模板与题目分析，再独立升级总体文件 AI 管理，没有开启第十一拆分切片。Windows 发布 Session 的提交保持不变，本阶段未修改 release 文件、未重新打包、未推送。**

Session D 的布局、键盘、焦点、状态播报、截图结论和可直接复制的下一 Session 提示词见 `docs/SESSION_D_SUMMARY_AND_NEXT_PROMPT.md`；Session C 候选证据仍保留在 `docs/SESSION_C_SUMMARY_AND_NEXT_PROMPT.md`，但没有被本 Session 重新打包或复用为新候选摘要。

### 完整工作区与总体文件 AI 上下文 Sessions（2026-07-23）

新建模板/题目目录阶段的原始任务起点为 `89dbde315457e95be0ec8198c7830c3c69b10288`，并发 Windows 发布工作结束后的实际基座为 `95a7795a8aac249714f4f6a3ddecd4e3066cdf87`。总体文件 AI 阶段以 `fabb334` 为实际起点；两个阶段都未修改发布脚本、依赖或平台验收证据。

- ADR-0022 引入 `schemaVersion: 1` 的 `WorkspaceTemplateCatalog`；ADR-0023 将同一完整目录标准扩展到总体文件 AI，并定义最终输入预算、一次性 `previewId` 快照、notes 隐私与旧计划兼容。目录树确定性排序，根目录模板使用 `rootTemplates`，每份模板保留稳定 ID、名称、语言、工作区相对路径与紧凑元数据。
- 三个 AI 入口都包含全部目录、ID、名称、相对路径和语言，不设置 300 个模板或 250 个文件计划候选的产品级硬上限。题目候选仍用完整 `catalogTemplateRefs` 复检，最多返回 8 项；伪造、重复、不可用或跨工作区 ID 均被过滤。
- 301 个短模板实测稳定上下文 98,774 字符/估算 24,694 Token；500 个短模板为 162,916 字符/估算 40,729 Token。两组均完整发送名称、ID、相对路径和分级树，`templateNamesTruncated === false`。
- 完整目录继续通过现有 Provider Adapter 进入 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini GenerateContent 和 Ollama，没有增加第二次精排请求。相关模板、详细候选和有限源码只作为补充，不再决定目录覆盖或候选资格。
- 输入安全预算为 96,000 个估算 Token，并覆盖最终稳定 catalog、审计 JSON、候选元数据/notes/源码、system prompt、Schema 与协议开销。退化顺序为缩短摘要、省略附加元数据、省略或缩短源码、再省略非审计详细候选；最小完整目录或审计必需候选仍超预算时，在网络发送前以 `AI_CONTEXT_TOO_LARGE` 失败。
- `previewFilePlan` 在 Main 内存创建 5 分钟 TTL、一次性消费的快照；正式生成只接受 `previewId`，发送前复检工作区与 Provider/模型、catalog、候选源码指纹和 metadata 版本。过期、重复消费、跨工作区、Provider 变化或外部文件变化均要求重新预览。
- 总体文件 AI 的用户笔记默认不发送，明确开启后才计入预览数量、字符数和总预算；新建模板/题目的 catalog 仍不含 notes。绝对路径、数据库/图片/备份路径、API Key、自定义鉴权头、密钥引用、错误日志、SHA-256、mtime 和大小不进入 Provider payload。
- 文件计划预览显示完整目录覆盖、详细候选、源码/元数据/notes 字符、总输入 Token、退化标志、输入哈希与到期时间。计划审查显示八个元数据字段的旧值到新值，notes 标为高风险；所有删除默认未选，高度相似删除显示本地保留项证据；缺少 `previousMetadata` 的旧计划继续可读。
- 没有 SQLite schema、migration、持久化文件格式、Provider timeout/重试边界、系统权限或新依赖变化。文件计划 IPC/Zod 的正式生成参数改为 `previewId`，快照不落库、不跨重启；全新、空白和已有 V2 userData 使用同一运行时 catalog，无需数据迁移。
- Provider 边界仍为：`timeoutMs` 分别限制连接与响应读取；只对限流、连接突断/超时及 408/500/502/503/504 最多尝试 3 次，`Retry-After` 实际等待上限 10 秒；响应超时和流中断不自动重试。Token 是本地估算，不是供应商窗口保证，极端请求仍可能被特定 Provider 拒绝。

当前源码的最终证据：定向 Vitest 4 个文件/33 项通过；`npm run check` 通过 TypeScript、ESLint 0 warnings、Prettier、40 个 Vitest 文件/270 项和 8 项发布脚本测试；文件管理、题目分析与模板入库 18/18 通过；最终单次完整 Electron E2E 为 57 项常规用例通过、2 项 packaged 因未设置 `PACKAGED_APP_PATH` 条件跳过。总体文件 AI 新增 9 张、原有模板/题目目录 8 张截图均已人工复核。本阶段没有重跑性能基准、没有重新打包，也没有推送远程。

Session A 已交付四条可运行纵向切片：第一切片完成备份 ADR、版本化数据管理契约、只读一致性诊断、`.awb-backup` 目录备份包导出、全包 SHA-256 验证、损坏包拒绝和只读恢复预览；第二切片开放恢复执行、恢复前自动预备份以及 SQLite/userData 事务式恢复和故障回滚；第三切片补齐备份保留建议、空间统计、异常残留保护、逐项清理预览、应用隔离区和可撤销回滚；最终切片用版本化 journal、SQLite 事务提交标记和内容指纹完成异常中断后的人工安全恢复，并允许把已验证隔离记录移交系统废纸篓。

Session A 按以下顺序交付：

1. 已完成：新增 ADR，确定备份包版本、清单、校验和、密钥排除、临时文件和原子替换策略。
2. 已完成：实现只读数据清单与一致性校验，覆盖 SQLite、WAL、题目图片、文件计划备份、批量覆盖备份和 Provider 非密钥配置。
3. 已完成：实现导出到用户明确选择的位置；完成校验前不发布最终备份包。
4. 已完成：选择备份包后执行恢复预览和完整校验；确认前不修改当前 userData 或外部模板工作区。
5. 已完成：恢复执行前自动保存当前状态；恢复 SQLite、题目图片、文件计划备份和批量导入备份；失败时回滚。
6. 已验证：全新 userData 空白导出/恢复、已有 V2 数据导出/恢复、篡改包拒绝、故障注入回滚、真实 Electron 入口、完整 E2E、macOS arm64 目录包 smoke。
7. 已完成：默认永久保留以及 7/30/90 天建议策略；策略不自动删除，最新有效恢复预备份始终受保护。
8. 已完成：Main 生成不透明候选 ID，执行前重新检查路径边界、符号链接和文件指纹；Renderer 不提交任意文件路径。
9. 已完成：选中项先预览和确认，再原子移入 `data-management-quarantine/`；支持撤销，批量中途失败会整批回滚，首版不开放永久删除。
10. 已完成：残留 `.restore-*.tmp` 与 `.cleanup-*.tmp` 在 journal、预备份、提交标记和内容指纹一致时可从数据管理页预览并手动恢复；损坏或来源不明的残留仍只读报告并保护。
11. 已完成：已完成隔离记录可逐项预览、二次确认并移交 Electron 系统废纸篓；应用不直接永久递归删除，永久清空仍由操作系统和用户决定。

Session B 已交付以下稳定性闭环：

1. 新增 ADR-0016，固定 1 MiB 原始响应上限、阶段错误、连接/响应超时、流中断、取消、有限重试、`Retry-After` 上限和日志脱敏策略。
2. 题目分析、模板元数据补全和工作区文件计划统一经过围栏提取、平衡 JSON、常见 envelope、Zod、一次结构修复和受限语义校验管线。
3. 增量读取响应体；缺失或伪造 `Content-Length` 时仍按实际字节中止。OpenAI Responses SSE 必须观察完成标记，截断流不得作为成功。
4. Main 使用进程内任务注册表统一拒绝重复 `requestId`；Renderer 通过命名明确的 Preload/IPC 取消题目分析、模板补全和文件计划，取消传播到准备、退避和 Provider 请求。
5. 401/403、模型不存在、能力不足、普通 400/422 和结构/语义错误不做网络重试；429、连接瞬断、连接超时与 408/500/502/503/504 最多 3 次网络尝试，退避最多 10 秒且可取消。
6. 发送预览显示 Provider、模型、协议、最终主机、视觉/结构化能力和将发送的数据类型；失败后关闭预览浮层并在原页面显示可操作错误，用户输入仍保留。
7. 五协议契约矩阵逐协议覆盖成功、结构化 JSON、鉴权、模型、限流、5xx、连接/响应超时、取消、无效 JSON、超大响应、截断流和能力不足。
8. 三类真实 Electron 入口验证取消会关闭本地 mock 连接，无效 JSON 不创建题目、模板文件或文件计划；Session A 的 8 项数据管理回归全部继续通过。

### 0.1 九项 Bugfix Session 交付

本次从实际 HEAD `de685da` 开始，保留 Session A/B 的数据恢复、取消、有限重试、错误分类和日志脱敏能力。实现按 ADR、低风险状态修复、模板移动与计划归档、统一题目工作流、图标与完整发布验收形成独立本地提交；没有推送远程仓库。

| 项目                  | 原因                                                           | 修复与验收                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. 新建模板关闭按钮   | 可见按钮与命中区域尺寸、圆角边界不一致                         | 统一 `close` 按钮为 44×44，中心、背景和距四角 3 px 的命中点均落在按钮本身；Escape、取消和右上角关闭继续零写入                                                                                                                                                |
| 2. 模板树展开状态     | 树挂载时总是默认展开一级且搜索展开复用同一状态                 | 新工作区全部折叠；按 workspace UUID + 相对目录 ID 保存手动状态；切页、重启和多工作区隔离；搜索展开只驻留内存，重扫过滤失效目录                                                                                                                               |
| 3. 统一题目创建       | 手动编辑器和 AI 分析维护两份互不共享的草稿                     | 只保留一个“新建题目”窗口；手动、文本 AI、图文 AI、图片、结构字段和多模板关系使用同一内存草稿；AI 只补空字段，失败或取消保留手工内容，最终一次原子提交                                                                                                        |
| 4. 模板计数           | 数据管理统计所有历史工作区和不可用索引                         | 普通“模板”统一统计当前活动工作区 `available = true`；真实 Electron E2E 覆盖 2/1/0 模板、工作区切换、取消切换、文件消失重扫和历史工作区记录保留                                                                                                               |
| 5. 切换工作区         | 原入口“重新选择”含义不明确                                     | 当前工作区卡片和模板库标题区统一为一个清晰主入口“切换工作区”；取消或失败保持原工作区，选择后仍先只读扫描                                                                                                                                                     |
| 6. 模板重命名/移动    | 路径派生 ID 会导致元数据与题目关系迁移复杂，且缺少独立安全入口 | Main 生成不透明预览 ID 并校验相对路径、扩展名、冲突、符号链接和源指纹；执行前备份，文件与 SQLite 使用补偿事务，稳定模板 ID、元数据和关系保持；故障注入证明回滚                                                                                               |
| 7. 文件计划滚动与删除 | 历史列表无限拉长且没有安全清理语义                             | 列表成为可聚焦、可键盘滚动的内部滚动区；单条/批量删除均二次确认并采用软归档，事务失败整批回滚；执行记录、撤销能力和安全备份不删除                                                                                                                            |
| 8. App 图标           | 旧 PNG 四角为不透明白色且主体偏小                              | 复用白色立方体和圆角方形，改为青—蓝—紫—粉品牌渐变；新增可复现渲染脚本，源 PNG 与打包 `icon.icns` 的 1024 层四角均为 `(0,0,0,0)`，主体 alpha 边界为 `(48,48)–(976,976)`                                                                                       |
| 9. AI 本地多模板关联  | 本地召回偏向单一候选，中文连续文本匹配弱，草稿缺少作用解释     | Main 使用中文 2–4 字 n-gram、名称、路径、标签、元数据、复杂度、用途、约束、前置条件和受限源码上下文；候选池最多 24 份/30,000 字符，草稿最多 8 份并保留跨顶层方向；作用分类只用于草稿，数据库关系类型不变；伪造 ID 丢弃、重复 ID 确定性去重、低置信度默认不选 |

Bugfix 数据与安全边界：

- 新增 ADR-0017；新增 migration `0005_bugfix_workflows.sql`，只为 `file_change_plans` 增加可空 `archived_at`，旧记录默认未归档。
- 模板移动、计划归档、题目最终提交仍由 Main 执行并经过 Zod 与命名 IPC；Renderer 没有获得文件系统、SQLite、原始 IPC 或密钥权限。
- 模板移动前备份保存到既有 `file-plan-backups/`，归档计划不删除 `file_change_executions` 或备份；已归档且已执行计划仍可撤销。
- 统一题目关闭、AI 失败、AI 取消和候选校验失败均不创建题目、图片或关系；最终关系只来自用户仍勾选的真实当前工作区模板。
- 模板树状态仅写入本机 `localStorage` 的展示偏好，不进入数据库或备份，也不写绝对路径。
- 全新 userData、空白工作区和已有 V2 数据均通过真实入口；旧数据库原位运行第 6 个 migration，不依赖删除数据库。旧项目仍保持只读且不参与运行。

本阶段红线：

- 不导出明文 API Key，默认也不导出加密密钥文件。
- 不把模板源码复制进应用安装包；用户工作区是否纳入备份必须由用户明确选择。
- 恢复不得直接覆盖当前数据；必须先预览、校验并备份现状。
- 不提供旧项目迁移，不修改 `../智能算法学习助手`。
- 不把 `.codex/config.toml` 与 `问题反馈.txt` 纳入提交。

Session A 新增事实：

- 备份格式：`v1` `.awb-backup` 目录包，包含 `manifest.json`、`checksums.sha256`、`COMPLETED` 和 `data/`。
- SQLite 导出：Main 进程执行在线备份快照，快照内 `ai_provider_profiles.secret_ref` 清空，并重新运行 `quick_check` 与外键校验。
- 文件范围：默认包含 SQLite 快照、题目图片、`file-plan-backups/`、`batch-import-backups/`；默认排除 `secrets/`、Electron 缓存、Local/Session Storage、Cookies 和模板源码。
- 模板源码：必须由用户在数据管理页显式勾选才会复制；恢复执行首版只支持“跳过模板源码”，不会覆盖外部模板工作区。
- 恢复：选择备份包后必须先校验和预览；用户勾选确认后，Main 进程创建恢复前备份并执行恢复。Provider `secret_ref` 不恢复，恢复后需要用户重新配置 API Key。
- 新测试：`tests/e2e/data-management.spec.ts` 覆盖全新 userData 导出空白包、manifest 隐私声明、密钥目录排除、篡改后校验失败、已有 V2 数据恢复、模板源码跳过、Provider 密钥缺失状态和故障注入回滚。
- 生命周期契约：`schemaVersion: 1` 的清单按恢复预备份、文件计划备份、批量导入备份、题目图片残留、隔离区和异常中断分类，只返回计数、大小、时间、状态和候选短标识。
- 清理格式：隔离操作写入 `data-management-quarantine/<operation-id>/manifest.json` 与 `COMPLETED`；manifest 为 `v1`，只保存受控 userData 相对路径和文件树指纹，不包含正文或绝对路径。
- 保留边界：仍对应 `applied` 文件执行的备份、最新有效恢复预备份、符号链接和异常恢复目录不可选择；无记录备份与批量导入备份必须由用户主动判断。
- 中断恢复格式：恢复暂存目录使用 `restore-journal.json` `v1`，隔离暂存目录使用 `cleanup-journal.json` `v1`；只保存受控相对分类、大小、SHA-256 内容指纹、操作 ID 和恢复预备份文件名，不记录正文或绝对路径。
- SQLite 提交方向：恢复数据与 `data_restore_commit:<restore-id>` 标记在同一事务提交；无标记只允许恢复旧文件状态，有标记只保留已提交新状态并完成暂存目录收尾。正常完成后移除标记，导出快照固定剔除标记。
- 系统废纸篓：隔离记录执行前重新核对 manifest、完整文件树和内容指纹，一次只移交一个操作；Renderer 只提交不透明 UUID 和确认字段。

Session B 新增事实：

- 网络响应：原始 HTTP 响应体硬上限 1 MiB，使用增量读取；结构修复输入最多 32,000 字符，不持久化完整响应。
- 超时：Provider `timeoutMs` 分别约束连接阶段和响应读取阶段，公开错误区分 `AI_CONNECTION_TIMEOUT` 与 `AI_RESPONSE_TIMEOUT`。
- 流式中断：SSE 必须包含协议完成标记；错误事件、畸形数据帧、提前关闭或缺少完成标记统一为 `AI_STREAM_INTERRUPTED`，不自动重试。
- 网络重试：每个 Provider 阶段最多首次加 2 次重试；`Retry-After` 支持秒数和 HTTP 日期，实际等待硬上限 10 秒。
- 取消：`AiTaskRunRegistry` 只保存进程内 `task + requestId + AbortController`，不写 SQLite；任务返回或文件计划落库前再次检查取消状态。
- 错误契约：公开 IPC 可携带安全 `stage`，新增连接超时、响应超时、超大响应、服务不可用和流中断错误码；不回显供应商错误正文。
- 数据：Session B 没有新增 migration、数据库字段或持久化文件格式，也没有改变文件计划 `operations_json` 安全 Schema。

Session C 新增事实：

- ADR-0018 把 preview、signed/notarized、Windows CI 构建和 Windows 实机验收分成独立证据；signed 模式缺凭据即失败，不降级为未签名包。
- `package.json` 是唯一机器可读版本事实源；候选只精确选择当前版本、平台和架构，不会把 `release/` 中的历史产物混入摘要。
- macOS 使用最小 hardened-runtime entitlement，只保留 JIT 与 unsigned executable memory，没有启用 `disable-library-validation`。
- 候选一次生成 DMG/ZIP、SHA-256、CycloneDX SBOM、构建元数据、发布说明草稿与制品验证报告；验证覆盖 Info.plist、App/原生模块架构、图标、DMG、签名/公证真实状态和隐私内容。
- GitHub Actions 固定 checkout/setup-node/upload-artifact 的 commit SHA；原生 macOS arm64 与 Windows x64 runner 各运行候选构建和两项打包入口 smoke。CI Windows 结果仍只代表构建与未安装 App 启动，不代表 NSIS 实机验收。
- `scripts/release/windows-acceptance.ps1` 可在真实 Windows 主机验证摘要、Authenticode、NSIS 安装、启动、已有 V2 数据、快捷方式、卸载和 userData 保留，并输出不含用户路径的证据 JSON。
- Session C 历史本机候选来自干净提交 `5817eab`；macOS signed 预检在 `0 valid identities found` 时按设计失败，preview 候选则完整通过。本次 Session F 最终候选另见“最终收尾与 unsigned beta 实测”。

Session D 新增事实：

- 通用 `ResizableLayout` 只用于真正的多面板工作区；导航、模板树、题目列表和 Provider 列表支持鼠标拖动、方向键、Shift 加速、Home/End、Enter/Space 和双击重置。
- 布局偏好仅保存在 Renderer `localStorage`，前缀为 `ui:layout:v1:`，稳定 key 为 `app-navigation`、`template-library`、`problem-workspace`、`ai-provider-workspace`；不保存绝对路径，不进入数据库、备份或跨进程 IPC。
- 全局“重置布局”只移除上述 UI 偏好；缺失、非数字和越界值自动回退到安全默认值。旧 V2 userData 无需 migration，新用户直接使用默认宽度。
- 对话框首项焦点、Escape/取消/右上角关闭和触发器焦点回归已统一；焦点恢复只在当前焦点空闲时发生，不覆盖用户刚刚移动到的新控件。
- 页面切换、成功、失败、AI 取消、计划状态和恢复结果使用不包含题面或源码正文的 `status` / `alert` / `aria-live` 播报；模板树和文件计划历史补齐标准方向键、Home/End、Enter/Space 行为。
- Electron 最小窗口恢复为真实 1024×640；200% 缩放时导航变为 72 px 图标栏，六个入口仍保留。长工作区名、长路径、长题目、600–900 字符连续题面和 16 个长标签均有自动化证据。
- ResizableLayout 面板和模板树被约束到容器高度，大型虚拟树和题目列表在各自区域内部滚动，不再撑高或滚动整个工作区。
- 本 Session 没有新增数据库字段、migration、IPC、系统权限或 ADR；Main/Preload/Renderer 安全边界和 Session C 发布脚本保持不变。
- 最终截图目录为 `/Users/ffxx/Desktop/项目/智能算法学习助手-v2/output/playwright/session-d-final/`，覆盖模板库、题目、AI 管理、数据管理的 1440×900、1280×720、1024×640、亮暗主题与 200% 关键状态，并包含减少动效和可见分隔条焦点证据。

Session D 后续修复（基线 `8071970`）：

- 题目详情补齐面板高度约束，长题面不再把详情撑高后被外层裁切；题目列表、详情与编辑字段区均支持真实鼠标滚轮和滚动条拖动，滚动区域可聚焦且使用稳定滚动条槽。
- 编辑题目卡片改为固定头部/底部操作区与中间独立滚动；1024×640 下关闭、取消、保存和错误信息保持可达。
- 新建/编辑题目的右上角关闭按钮使用显式受控关闭，Lucide `X` 明确不参与指针命中；真实鼠标点击两个 `X` 图标中心均命中 `BUTTON`、退出并恢复焦点。
- AI 发送预览的 `X`/Escape 不再与底部“返回修改/取消生成”共用动作：前者退出整张题目卡片，后者保留草稿。题目卡片主 `X`、预览 `X` 和底部取消在卡片可见时永不禁用；生成中点击 `X` 会先复用既有取消 IPC 关闭连接再退出。若用户已经明确点击“创建题目”，已确认的原子保存可在界面退出后完成。
- 题目长图预览默认按可读宽度显示，在可聚焦区域内纵向滚动；可切换为整图适配。重新打开或切换模式回到顶部，Escape/关闭后焦点返回图片触发器。
- 共享 `Button` 内的 Lucide SVG 使用 `pointer-events: none`，完整按钮负责命中；真实鼠标点击新建模板和图片预览的 `X` 笔画中心均可关闭，且可用按钮显示 pointer 光标。
- 新建模板卡片的真实根因不是按钮尺寸或用户打开了旧包，而是其顶部 `X` 与 macOS `hiddenInset` 下 60 px 原生窗口拖拽区重叠；Playwright 合成鼠标会绕过该原生命中层，因而旧回归产生了假阳性。所有 `.dialog-overlay` / `.dialog-surface` 现明确为 `-webkit-app-region: no-drag`；新建模板顶部 `X`、取消与 Escape 共用显式受控关闭，AI 请求中会先取消再退出。
- “执行与撤销”新增单条与批量删除；只允许删除当前工作区中已撤销的执行记录。仍有撤销备份的 `applied` 记录必须先撤销，不能绕过恢复能力保护。
- 新增 ADR-0019、命名 `delete-file-executions` IPC 与 Zod 契约；Renderer 只提交不重复 UUID。Repository 在单个 SQLite 事务内先验证全部工作区/状态，再批量删除；失败整批回滚。
- 没有数据库字段或 migration；撤销流程原本已清理对应备份目录，因此删除已撤销记录不删除任何文件。数据管理继续直接统计 `file_change_executions`，删除后计数同步减少。
- Electron E2E 使用 600×4000 PNG 覆盖按宽度滚动、整图、200% 与焦点回归，并覆盖未撤销拒绝、混合批次拒绝、确认焦点、用户文件不变和数据管理计数 1→0。
- Electron E2E 另使用 36 道题和长题面验证列表/详情/编辑器的滚轮及滚动条拖动；截图为 `problem-card-detail-scroll-1024x640.png` 与 `problem-editor-scroll-and-close-1024x640.png`。
- 题目 AI E2E 使用受控慢响应验证空闲预览 `X`、Escape 与生成中 `X`；关闭后触发器回焦、连接关闭且题目零写入。截图为 `problem-ai-busy-close-1440x900.png`。
- 截图位于 `/Users/ffxx/Desktop/项目/智能算法学习助手-v2/output/playwright/`，其余文件名以 `problem-image-long-preview-` 和 `file-execution-delete-` 开头。

当前 macOS arm64 目录包已从源码提交 `4c13dc8` 使用 `package:dir` 重新生成，位于 `release/mac-arm64/算法学习工作台.app`；该后续修复把代码专注模式通过 portal 挂到 `document.body`，避免工作台面板分隔条覆盖代码或截获点击，并保持 Esc 与触发按钮焦点回归。全新/已有 V2 userData 的 packaged smoke 2 项通过；常规 Electron E2E 还会在原分隔条坐标验证命中目标属于全屏代码视图。`release/candidates/0.1.2-mac-arm64-preview/` 仍是 Session C 历史候选证据，没有被本轮复用或重写。`release/` 已被 Git 忽略，目录包不属于源码提交；该 App 未正式签名或公证，只能用于本机预览与验收。

## 1. 结论先行

V2 已经完成从零开始使用所需的核心纵向流程，不再是界面原型：新用户可以创建空白工作区，录入和浏览模板，创建题目并建立多对多关联，配置多供应商 AI，确认题目分析草稿，并通过可预览、可撤销的计划整理模板文件。

当前工作的重心应从“继续增加页面和功能”切换为“把已有产品做成可放心发布和长期使用的工具”。V2 数据恢复、五类 AI 协议稳定性和发布候选自动化都已形成闭环；最高价值外部缺口是真实 Windows 验收和 macOS/Windows 代码签名，无证书或硬件时可并行推进 UX/可访问性。

按不同维度估算当前完成度：

| 维度               | 状态           | 估算完成度 | 判断                                                                                   |
| ------------------ | -------------- | ---------: | -------------------------------------------------------------------------------------- |
| 产品规格核心范围   | 基本完成       |        90% | 规格中的模板、题目、关联、AI 和文件计划均有真实桌面入口                                |
| 桌面架构与安全边界 | 稳定           |        85% | Main/Preload/Renderer 分层清楚，仍有发布供应链与文件竞态尾项                           |
| 数据可靠性         | Session A 完成 |        95% | 已有可验证导出/恢复、提交方向判定、中断恢复、保留建议、隔离、撤销和系统废纸篓移交      |
| AI Provider 稳定性 | Session B 完成 |        95% | 五类协议统一结构化管线、阶段错误、取消、有限重试与主要失败矩阵                         |
| UI 与交互          | Session D 完成 |        92% | 布局记忆、全键盘、焦点回归、状态播报、1024×640、200% 与减少动效均有自动化和截图证据    |
| 性能与大型工作区   | 未充分证明     |        65% | 有虚拟树和上下文上限，但没有大型工作区基准与增量相似度索引                             |
| 测试与工程质量     | 良好           |        98% | 195 项 Vitest、3 项发布脚本测试、52 项常规 Electron E2E 通过；2 项 packaged 按条件跳过 |
| 公开发布准备       | 外部门禁待完成 |        65% | 可重复候选与证据已完成；macOS 未签名/公证，Windows 未实机安装验证                      |

这些百分比用于安排优先级，不是发布承诺。公开发布必须按质量门禁逐项提供证据。

## 2. 当前 Git 与工作区规则

- 当前分支：`main`。
- 本 Session 阶段前 HEAD：`613980b`；Session C 候选源码提交仍为 `5817eab`，本交接完成后以本文所在提交为新基线。
- 用户保护内容：`.codex/config.toml`、`问题反馈.txt`；本切片开始与结束时前者保持未修改，后者保持未跟踪。
- 上述两个文件未被本切片覆盖、回滚、格式化、暂存或纳入提交，后续 Session 仍须继续排除。
- `C++高亮测试/代码高亮综合测试.cpp` 是本阶段保留的人工代码高亮验收夹具，已纳入源码提交。
- V2 不做旧项目数据迁移；`../智能算法学习助手` 只能作为只读行为参考。
- 每个 Session 开始前必须重新检查 `git status`，不能假设本文件记录的工作区状态永远不变。

## 3. 已实现功能矩阵

### 3.1 完整闭环

| 模块               | 已实现内容                                                                          | 主要证据                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 首次启动           | 创建空白工作区、选择已有目录、只读首扫、空状态                                      | `workspace-service.ts`、`workspace-onboarding.tsx`、`app.spec.ts`                           |
| 模板库             | 树形浏览、单子目录折叠、虚拟滚动、筛选、全局搜索、右键操作                          | `template-tree.tsx`、`template-tree-model.ts`                                               |
| 源码查看           | CodeMirror 6、C++ 高亮、VS Code 风格主题、独立主题记忆、聚焦大窗口                  | `code-viewer.tsx`、`scroll-and-code-viewer.spec.ts`                                         |
| 模板入库           | 中英文 AI 补全、批量 `.cpp` 选择/扫描、默认全选、无 AI 直导、逐项跳过/改名/备份覆盖 | `create-template-dialog.tsx`、`batch-template-import-dialog.tsx`、`template-intake.spec.ts` |
| 算法卡片           | 元数据、源码、题目关系、编辑和备份后删除                                            | `algorithm-card.tsx`、`template-metadata-card.tsx`                                          |
| 题目卡片           | 创建/编辑、状态、题面、备注、图片、长图滚动/整图预览、安全删除                      | `problem-workspace.tsx`、`problem-image-card.tsx`                                           |
| 模板题目关联       | 双向查看、从两侧新增/编辑/解除，多对多持久化                                        | `problem-repository.ts`、两类 relation dialog                                               |
| 题目 AI 分析       | 中英文结构化分析、原题面/摘要分离、整库候选证据、可编辑草稿后入库                   | `problem-analysis-service.ts`、`problem-analysis.spec.ts`                                   |
| AI 请求预览        | Provider/模型、输出语言、发送范围、截断状态、Token 粗估与缓存键                     | `ai-request-preview-dialog.tsx`、两类 AI E2E                                                |
| AI 设置            | 五类协议、Provider 增删改、密钥安全存储、连接测试、任务路由                         | `ai-provider-service.ts`、`ai-provider-workspace.tsx`                                       |
| Provider 预设      | DeepSeek、阿里云百炼快捷配置                                                        | `provider-presets.ts`                                                                       |
| AI 文件管理        | 只读审计、AI 计划、Diff、选择执行、备份、撤销、重新草拟、已撤销执行记录安全删除     | `template-management-service.ts`、`file-management.spec.ts`                                 |
| 主题与视觉         | 亮暗主题、四色语义系统、克制玻璃、环境光、微交互、减少动效                          | `globals.css`、`VISUAL_DESIGN.md`                                                           |
| 桌面布局与可访问性 | 可调整面板、布局恢复/重置、全键盘、焦点回归、状态播报、紧凑窗口和 200% 缩放         | `resizable-layout.tsx`、`accessibility-layout.spec.ts`、Session D 截图矩阵                  |

### 3.2 功能存在，但还没有达到发布级完整度

| 模块             | 当前能力                                                                          | 仍缺少的细节                                                                                     |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| V2 数据保护      | 可验证导出/恢复、原子回滚、中断恢复、空间统计、保留建议、逐项隔离/撤销/废纸篓移交 | 定时备份、用户可选压缩包格式和跨设备兼容验证                                                     |
| AI JSON 稳定性   | 三类任务统一 JSON 提取、envelope、Schema、一次结构修复和安全阶段错误              | 复杂供应商专属 tool-call envelope 尚未纳入首批协议边界                                           |
| Provider 兼容    | 五类 Adapter 已覆盖统一成功与主要失败契约矩阵                                     | 尚未使用五个真实云端账号做外部集成认证；当前证据为本地 mock 契约                                 |
| 错误处理         | 鉴权、模型、限流、网络、连接/响应超时、取消、能力、超大响应和流中断可操作提示     | 仍缺统一离线检测和跨应用重启的远端任务恢复；首版明确不恢复远端生成任务                           |
| 辅助技术人工验收 | 语义树、键盘、焦点、live region、减少动效和 200% 已自动化并人工查看截图           | macOS VoiceOver 仅完成语义/键盘证据，未做长期真人任务审计；Windows Narrator/高对比模式未实机验证 |
| 大型工作区       | 模板树虚拟化、读取与 AI 上下文有限额                                              | 相似度只分析前 500 个可读取文件，审计最多遍历前 2000 个模板，文件计划相关候选最多 250 个         |
| 发布             | macOS arm64 开发包、本地真实入口 smoke、Windows CI 构建配置                       | macOS Developer ID/notarization、Windows 实机安装/升级/卸载、正式校验和与发布渠道                |

### 3.3 尚未实现

- 应用内永久清空隔离数据；当前版本刻意只移交系统废纸篓，不绕过操作系统执行不可逆删除。
- 自动更新和更新回滚策略。
- 真实 Windows 主机的安装、启动、文件权限、升级和卸载证据。
- macOS/Windows 正式签名流程。
- 完整的大型工作区性能基准和后台增量索引。
- Provider 精确计费/成本估算和本地隐私历史（已有粗略 Token 估算与发送预览）。
- macOS VoiceOver 长流程人工使用审计，以及 Windows Narrator、高对比模式和真实 Windows 200% 缩放验收。

账号、云同步、在线判题、社区市场和移动端是明确暂不扩展的范围，不应被误报为缺陷。

## 4. 当前架构与数据流

```text
React Renderer
  -> window.desktop 类型化白名单
Preload
  -> 约 40 个按领域命名的 IPC 操作
Main
  -> Workspace / Problem / Template Management / AI Provider services
  -> SQLite + Drizzle
  -> 用户模板工作区
  -> userData 中的图片、加密密钥和文件计划备份
  -> 外部 AI Provider
```

### 4.1 进程边界

- Renderer 不直接使用 Node、文件系统、SQLite、密钥或网络。
- Preload 不暴露原始 `ipcRenderer`，只提供 `DesktopApi`。
- 除运行时信息外，领域 IPC 统一经过 Zod schema 和公开错误转换。
- Electron 窗口启用 sandbox、context isolation，关闭 Node integration。
- 外部文件路径由 Main 规范化并验证授权根目录。

### 4.2 数据所有权

| 数据                                                  | 实际位置                               | 备注                                                 |
| ----------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| 模板源码                                              | 用户选择的工作区                       | 文件是真实来源，SQLite 只做索引和元数据              |
| 工作区、模板索引、题目、关联、Provider 配置、计划记录 | `algorithm-workbench.sqlite`           | WAL、外键开启，使用版本化 migration                  |
| 题目图片                                              | `userData/problem-images/`             | 数据库保存相对路径和受控元信息                       |
| API Key                                               | `userData` 下独立加密文件              | Electron `safeStorage` 加密，SQLite 只存引用         |
| 文件操作备份                                          | `userData/file-plan-backups/`          | `applied` 执行备份受保护；其他项可在生命周期清单判断 |
| 批量覆盖备份                                          | `userData/batch-import-backups/`       | 覆盖前保存原文件；可统计、预览并由用户选择隔离       |
| 恢复预备份                                            | `userData/restore-preflight-backups/`  | 最新有效项始终保护；保留策略只生成建议               |
| 数据隔离区                                            | `userData/data-management-quarantine/` | `v1` 清单、完成标记、可撤销操作和系统废纸篓移交      |

### 4.3 数据库状态

- 当前共有 6 个顺序 migration：初始化、题目关联、AI Provider、模板管理、AI 上下文/题目结构、Bugfix 文件计划软归档。
- 领域 schema 包含工作区、模板、模板元数据、题目、图片、关联、Provider、任务路由、文件计划、执行记录和应用状态。
- 已有 migration E2E 验证旧阶段数据库原位升级，不依赖删除数据库。
- 数据管理页已提供 SQLite 快照导出、全包校验、恢复预览、恢复前自动备份、恢复执行、生命周期统计、隔离、撤销、中断恢复和系统废纸篓移交；Session A 未引入数据库 schema migration，恢复提交标记复用 `app_state`。

## 5. 工程规模与可维护性

- 当前 `src/` 与 `tests/` 下 TypeScript/TSX/CSS/SQL 文件 175 个，合计约 42,504 行。
- `App.tsx` 约 292 行；应用外壳、工作区路由、导航/快捷键、对话框状态、Dashboard 和模板库已经按语义拆出。
- `template-management-service.ts` 872 行（约 870 行）；审计、AI 文件计划、计划安全、执行/回滚和计划历史已移入五个语义服务文件。
- `ai-provider-workspace.tsx` 已从 745 行降至 246 行；编辑器、列表和纯表单逻辑分别形成 461/75/88 行的语义边界，Preload 调用仍只在 `use-ai-providers.ts`。
- `problem-analysis-dialog.tsx` 已从 969 行降至 826 行；193 行的 `problem-analysis-relations.tsx` 独立承载模板关联草稿展示与编辑，题目分析 Preload 调用仍留在原对话框。
- `features/problems/problem-workspace.tsx` 已从 904 行降至 539 行；405 行的 `problem-details-panel.tsx` 独立承载选中题目详情与详情操作确认，题目工作区 Preload 调用仍留在原工作区。
- `features/ai/file-management-workspace.tsx` 已从 1,156 行降至 573 行；403 行的 `file-management-history-panel.tsx` 承载历史与撤销，269 行的 `file-management-plan-review-panel.tsx` 承载计划审查，99 行的 `file-management-audit-panel.tsx` 承载只读审计展示；文件管理 Preload 调用仍留在原工作区。
- `features/data/data-management-workspace.tsx` 已从 1,164 行降至 889 行；194 行的 `data-backup-restore-panel.tsx` 独立承载导出/校验/恢复展示与确认，190 行的 `data-interrupted-recovery-panel.tsx` 独立承载异常中断条目/预览/确认，数据管理 Preload 调用仍留在原工作区。
- `batch-template-import-dialog.tsx` 约 643 行。

架构分层本身清楚，但上述文件已进入继续扩展会明显增加回归风险的尺寸。本 Session 已完成冻结；除真实 Bug、用户反馈或发布门禁外，不再继续维护性拆分。若未来重新开启任务，必须先记录问题证据和影响范围，再以行为不变、测试先行的方式拆分：

- `App.tsx`：第一切片已完成；应用壳、导航/快捷键、Dashboard、布局状态、对话框和领域路由均有独立边界。
- `template-management-service.ts`：第二切片已拆为审计、AI 计划生成、计划安全校验、文件执行器和计划历史五个协作者；批量入库、分类和 IPC façade 仍保持稳定。
- `ai-provider-workspace.tsx`：第三切片已拆为页面容器、编辑器、列表和纯表单模型；先用 3 项特征测试锁定保存/路由调用和请求头阻断。
- `problem-analysis-dialog.tsx`：第四切片先用 3 项组件特征测试锁定预览/分析/合并/提交/取消调用，再把模板关联草稿编辑器拆为只接收受控 props 的展示组件。
- `file-management-workspace.tsx`：第六切片先用 3 项特征测试锁定历史键盘、归档/重新草拟和回滚/删除调用，再把计划与执行历史拆为只接收受控数据、引用和回调的展示组件。
- `file-management-workspace.tsx`：第七切片再用 3 项特征测试锁定分组/Diff/勾选、空状态、取消/诊断和执行确认调用，再把待确认计划审查区拆为不访问 Preload 的受控组件。
- `file-management-workspace.tsx`：第八切片再用 3 项特征测试锁定审计进度/取消调用、问题说明、空结果和截断边界，再把只读审计结果拆为不访问 Preload 的纯展示组件。
- `data-management-workspace.tsx`：第九切片先用 3 项特征测试锁定导出/校验/恢复调用、manifest、确认焦点和恢复后播报，再把备份/恢复展示区拆为只接收受控 props 的组件；生命周期、中断恢复和所有 Preload 调用仍保留在父工作区。
- `data-management-workspace.tsx`：第十切片再用 3 项特征测试锁定可恢复/受保护条目、状态变化阻止确认、精确恢复参数和诊断刷新，再把异常中断恢复展示区拆为只接收受控 props 的组件；所有 Preload 调用、恢复结果发布和播报仍保留在父工作区。
- 大型 Renderer 文件：拆为页面容器、表单、列表/详情、状态 hook 和纯展示组件。
- 不要为了减少行数创建无语义的碎片文件；以独立数据流和可测试边界为拆分依据。

## 6. 当前验证基线

2026-07-23 在完整工作区 AI 模板目录源码提交 `720fca6` 重新执行：`npm run check` 通过 39 个 Vitest 文件/259 项和 7 项发布脚本测试，TypeScript、ESLint 0 warnings 与 Prettier 全部通过；`npm run test:e2e` 最终为 57 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过。新建模板/题目 AI 预览八张亮暗与紧凑窗口截图已人工复核。下面的打包、候选和完整 Session D 截图矩阵仍是历史平台证据，不替代本次源码门禁，也没有被本 Session 重新打包：

| 检查                               | 结果                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                    | 通过；另含 3 项 Node 发布脚本测试                                                                                         |
| TypeScript                         | 通过                                                                                                                      |
| ESLint（0 warnings）               | 通过                                                                                                                      |
| Prettier check                     | 通过                                                                                                                      |
| Vitest                             | 39 个文件，259 项通过；新增完整 catalog、300 模板、退化/超限、旧 24 项外候选、路径与隐私回归                              |
| 统一题目 Electron E2E              | 7 项通过；覆盖纯手动、文本/图文 AI、取消、预览 X/Escape、忙碌 X 取消连接、空候选、零写入和重启持久化                      |
| `npm run test:e2e`                 | 57 项常规 Electron E2E 通过，2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过                                        |
| 数据管理 Electron E2E              | 8 项通过；导出/恢复、隔离/撤销、提交前后中断恢复和故障回滚全部保持通过                                                    |
| 打包入口 smoke test                | 最终 macOS arm64 候选以全新 userData 启动，并写入工作区/模板后用同一 userData 重启，2 项通过                              |
| `npm audit --audit-level=moderate` | 通过，0 个漏洞                                                                                                            |
| Renderer 生产构建                  | 通过；主入口 352.08 kB，数据管理延迟块 29.04 kB，文件管理延迟块 27.40 kB，CodeMirror 延迟块 386.26 kB                     |
| Session D 布局/键盘 E2E            | 7 项通过；覆盖鼠标/键盘 resize、重启恢复、异常值回退、重置、焦点回归、live region、长内容、真实 1024×640、200% 和减少动效 |
| 亮暗/紧凑截图                      | `output/playwright/session-d-final/` 中 32 张四页面尺寸/主题/200% 截图，另含减少动效、分隔条焦点和 4 张联系图；已人工复核 |
| 图标与打包                         | 源 PNG 与打包 `icon.icns` 均为 1024×1024、带 alpha；App 与 `better_sqlite3.node` 均为 arm64                               |
| 候选制品                           | DMG `992ec6…d64`（138,091,048 B）；ZIP `5cf108…164`（137,555,476 B）；`hdiutil verify` 与摘要复核通过                     |
| 签名/公证                          | ad-hoc、无 Authority/TeamIdentifier、未 staple、Gatekeeper 不接受；signed 预检因无 Developer ID 按设计失败                |
| 备份与隐私复核                     | 扫描 10,739 个 ASAR 条目和 316 个 App 文件；用户数据、密钥形态、个人绝对路径和禁用文件命中均为 0                          |

说明：打包入口 smoke test 需要先生成 `release/mac-arm64` 目录包并设置 `PACKAGED_APP_PATH`，因此常规 E2E 中 2 项跳过是预期行为。本次已对最终候选单独执行并通过；任何新候选仍必须重新运行，不能沿用本次摘要。

### Session F 最终收尾与 unsigned beta 实测（2026-07-21）

本次收尾没有修改产品源码，只提交文档并以干净提交 `39421c0329c463657cb43c4e552949e48bee93c9` 生成候选。最终文档提交晚于候选来源提交时，必须继续区分两者；候选的机器可读来源以 `release/candidates/0.1.2-mac-arm64-preview/build-metadata.json` 为准。

| 检查               | 结果                                                                                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`    | 通过：36 个 Vitest 文件、235 项测试、3 项发布脚本测试；TypeScript、ESLint（0 warnings）、Prettier 均通过                                                                                                                                                                         |
| `npm run test:e2e` | 授权 GUI/本地端口后通过：54 项常规真实 Electron E2E；2 项 packaged 条件跳过；完整套件 56 项无失败                                                                                                                                                                                |
| 候选命令           | `npm run release:mac:preview` 成功；`sourceTree=clean`，版本 `0.1.2`，平台/架构 `mac/arm64`，Electron `43.1.0`，electron-builder `26.15.3`                                                                                                                                       |
| 候选制品           | `release/算法学习工作台-0.1.2-mac-arm64.dmg`：138,104,754 B，SHA-256 `798c94f809bb42a87eb2bff12c861f507c3b6c8fc44c5e1cf0b357a3ac742662`；`release/算法学习工作台-0.1.2-mac-arm64.zip`：137,580,378 B，SHA-256 `e918b578d465b5eda1c146e14dff2d30721a4f1c7a941baddd1c4a922f73943b` |
| App/原生模块       | App 主程序与 `better_sqlite3.node` 均为 Mach-O 64-bit arm64；Electron module ABI `148`                                                                                                                                                                                           |
| Info.plist/图标    | appId `com.algorithmworkbench.desktop`，版本/build `0.1.2`，最低 macOS `12.0`；源 PNG 与打包 `icon.icns` 均 1024×1024、alpha corners `(0,0,0,0)`、alpha bbox `(48,48)-(976,976)`                                                                                                 |
| DMG/ZIP            | `hdiutil verify` 有效；`unzip -tq` 完整通过；候选 `SHA256SUMS.txt` 复核通过                                                                                                                                                                                                      |
| SBOM/隐私          | CycloneDX 1.5，93 个组件；ASAR 10,739 条目、App 文件 316 个；禁用条目、禁用外部文件、个人绝对路径、疑似密钥均 0 命中                                                                                                                                                             |
| packaged smoke     | 使用候选 App，`tests/e2e/packaged.spec.ts` 全新 userData 与已有 V2 userData 重启均通过，2 项                                                                                                                                                                                     |
| 签名状态           | unsigned/ad-hoc preview；无 Authority/TeamIdentifier，未 staple，Gatekeeper 不接受；不得描述为正式签名版本                                                                                                                                                                       |

候选证据目录：`release/candidates/0.1.2-mac-arm64-preview/`，包含 `SHA256SUMS.txt`、`RELEASE_NOTES.md`、`artifact-verification.json`、`build-metadata.json`、`sbom.cyclonedx.json`。候选不包含 API Key、用户数据库、题目图片、个人模板、Provider 配置、个人绝对路径、`.codex/config.toml` 或 `问题反馈.txt`；后两者也未被暂存或提交。性能基准未重跑，因为本次没有修改扫描、查询、索引或启动实现。

Session D 截图显示 1024×640 下导航、列表/树、详情和页头主操作仍可达；200% 下使用紧凑图标导航，主操作通过在视口断言。首页在窄视口隐藏重复装饰并压缩 Hero，但不隐藏三个核心入口。玻璃与环境光仍须限定在导航、浮层和重点状态，不能扩散到长文本或表格主体。

## 7. 风险和细节债务

### P0：公开发布前必须完成

1. macOS Developer ID 签名与 notarization；Windows Authenticode 和真实 Windows 安装/升级/卸载验证。
2. 在获得受保护凭据后从同一提交运行 `release:mac:signed` / `release:win:signed`，保存签名、公证和摘要证据；不要给聊天发送私钥或密码。

### P1：发布候选继续完善

1. 在发布候选使用实际计划支持的云端账号做人工 Provider smoke；Session B 的自动化矩阵使用本地 mock，不代表外部账号、配额和区域权限认证。
2. 为文件计划执行与回滚增加故障注入单元/集成测试，覆盖第 N 步失败、磁盘满、目标占用和数据库提交失败；外部修改整批拒绝已覆盖。
3. 在 macOS 上做 VoiceOver 长流程真人审计，并在真实 Windows 上验证 Narrator、高对比模式和 200% 缩放；当前仅有语义树、键盘自动化和 macOS 截图证据。
4. 建立大型工作区基准、增量索引和后台任务；不要直接提高仍在生效的 500/2,000 等安全上限，AI 上下文继续按实际序列化预算治理。
5. 拆分超大组件和服务，避免在同一提交混入新功能与视觉重构。
6. 为批量导入增加直接恢复到工作区的用户可见撤销；其备份统计、保留建议和隔离入口已完成。

### P2：稳定发布后再做

1. 自动更新、增量下载和更新回滚。
2. 可选的模型枚举与能力探测；必须保留手填模型 ID。
3. 增量相似度索引、后台任务和大型工作区进度面板。
4. AI 请求精确成本提示和本地隐私审计。
5. 更精细的首页最近访问模型、收藏和工作区切换体验。

## 8. 大型工作区的已知上限

当前限制是保护桌面响应和 Provider 上下文的安全阀，不代表大型工作区已经验证：

- 单模板源码最大 2 MiB。
- 完整审计最多遍历前 2,000 个模板。
- 相同/相似源码分析最多保留前 500 个可读取文件参与相似度比较。
- AI 文件计划必须详细表达全部审计必需候选，再按预算补充本地相关候选；不设候选数量硬上限，源码片段总量最多约 120,000 字符。若审计组路径本身截断或必需候选超预算，会在网络前明确失败并要求缩小范围。
- 模板补全、题目分析和总体文件 AI 都发送完整目录、ID、名称、相对路径和语言，不设模板数量硬上限；工作区上下文最多 240,000 字符，总请求估算预算 96,000 Token。保留必需信息后仍超预算时会在发送前明确失败；相关详情仍是可退化补充，不限制目录覆盖或题目候选资格。
- 单题最多 12 张本地图片；单次分析最多 6 张、合计 24 MiB。
- 文件计划和执行历史界面各最多读取最近 100 条。

后续不能简单提高这些数字。应先建立增量索引、分页查询、后台任务、取消能力、进度反馈和稳定的截断说明。

## 9. 多 Session 任务拆分

各 Session 必须从仓库根目录启动，先阅读 `AGENTS.md` 和本文件。一个 Session 只承担一个主题，避免同时修改数据库、视觉系统和发布工程。

### Session A：数据可靠性与恢复（已归档）

状态：已完成。不可逆永久清空仍刻意不在应用内开放；已验证隔离记录通过系统废纸篓移交。

目标：让 V2 用户数据可以被验证地备份、恢复和清理。

主要范围：

- 新 ADR：备份包格式、密钥处理、原子恢复和兼容策略。
- Main 服务、Preload API、Zod 契约、SQLite migration（若需要）。
- 设置或数据管理页面中的导出、验证、恢复和空间清理入口。
- 数据损坏、导入中断和版本不兼容测试。
- 版本化恢复/清理 journal、SQLite 事务提交标记、提交前后中断方向判定和显式人工恢复。

验收：

- 全新 userData 导入备份后，题目、图片、关系、模板元数据和 Provider 非密钥配置一致。
- 恢复前自动备份当前状态；失败不破坏现有数据。
- 导出包不含明文 API Key，日志不含题面和源码。
- 能识别孤立图片、残留 `.trash` 和无对应记录的备份，但未经确认不删除。
- 能安全恢复有完整证据的 `.restore-*.tmp` / `.cleanup-*.tmp`；损坏或冲突残留保持只读保护。
- 已完成隔离记录只能经预览和确认移交系统废纸篓，应用不直接永久删除。

归档说明：除非发现回归或要新增备份格式版本，不再从 Session A 启动提示重复实现；后续数据契约变化必须继续更新 ADR 0015 并保持 `v1` 兼容读取。

### Session B：AI 稳定性与兼容矩阵（已归档）

状态：已完成。统一管线、取消、有限重试、公开阶段错误与五协议本地 mock 契约矩阵已经落地。

目标：减少“AI 返回无效格式”和不同兼容服务行为差异造成的失败。

主要范围：

- 统一结构化 JSON 管线，复用围栏提取、平衡对象、envelope 归一化和一次有限修复。
- 任务级超时、取消、Retry-After、有限重试和错误诊断。
- 五协议兼容矩阵及本地 mock 契约测试。
- Provider/模型/能力/最终主机和将发送的数据类型预览。

验收：

- 题目分析、模板补全、文件计划使用同一套可观测解析阶段。
- 无效 JSON 不会落库或生成可执行计划；错误提示说明下一步。
- 不重试鉴权和模型不存在；429/5xx/网络中断只做有上限且可取消的重试。
- 覆盖 OpenAI Chat、Responses、Anthropic、Gemini、Ollama。

兼容矩阵结论：

| 场景                                     | OpenAI Chat | OpenAI Responses | Anthropic | Gemini | Ollama |
| ---------------------------------------- | ----------- | ---------------- | --------- | ------ | ------ |
| 成功文本与结构化 JSON                    | 通过        | 通过             | 通过      | 通过   | 通过   |
| 401 / 403                                | 通过        | 通过             | 通过      | 通过   | 通过   |
| 404 / 模型不存在                         | 通过        | 通过             | 通过      | 通过   | 通过   |
| 429 / `Retry-After`                      | 通过        | 通过             | 通过      | 通过   | 通过   |
| 408 与主要 5xx 分类、有限重试            | 通过        | 通过             | 通过      | 通过   | 通过   |
| 连接超时 / 响应超时                      | 通过        | 通过             | 通过      | 通过   | 通过   |
| 用户取消                                 | 通过        | 通过             | 通过      | 通过   | 通过   |
| 无效模型 JSON / 一次修复后失败           | 通过        | 通过             | 通过      | 通过   | 通过   |
| 无 `Content-Length` 的超大响应           | 通过        | 通过             | 通过      | 通过   | 通过   |
| 截断流 / 缺少完成标记                    | 通过        | 通过             | 通过      | 通过   | 通过   |
| 不支持视觉时请求前阻止                   | 通过        | 通过             | 通过      | 通过   | 通过   |
| 不支持原生结构化时 Prompt + 本地严格校验 | 通过        | 通过             | 通过      | 通过   | 通过   |

未覆盖：五个真实外部服务的账号权限、区域端点、账单、代理链和供应商灰度变体；这些属于发布候选人工 smoke，不得把本地 mock 结果描述为云端认证。

归档说明：后续仅在新增协议、改变响应上限/重试边界或发现兼容回归时继续更新 ADR-0016 和矩阵；不得为单个兼容端点绕过最终 Zod 校验或文件计划安全 Schema。

### Session C：发布工程与平台验收（自动化已完成，外部门禁待完成）

状态：可重复候选、摘要、SBOM、元数据、隐私/架构/图标检查、双 userData smoke、签名失败关闭和 Windows 实机脚本已完成。当前机器没有 Apple Developer ID/notarization 凭据，也没有 Windows 实机，因此不能把签名、公证和 NSIS 实机验收标记为通过。

目标：把开发预览推进到可验证的发布候选。

已完成范围：

- ADR-0018、preview/signed 双模式与最小 hardened-runtime entitlement。
- 当前版本精确产物、CHANGELOG、SHA-256、CycloneDX SBOM、构建元数据、隐私报告和发布说明草稿。
- 固定 Action SHA 的候选 CI、macOS/Windows 打包入口 smoke 和 Windows 实机验收脚本。
- 自动更新明确保持范围外；实现前需要独立 ADR。

已通过：

- 同一次构建产生版本化产物、SHA-256 和发布说明。
- 全新 userData 与已有 V2 userData 的打包入口 smoke 均通过。

仍受外部条件阻塞：

- macOS `codesign --verify`、`spctl` 和 notarization 正式证据。
- Windows Authenticode 和真实主机的安装、启动、已有 V2 数据升级、快捷方式、权限及卸载保留策略。

恢复外部门禁时的启动提示：

> 阅读 AGENTS.md、docs/RELEASE.md 与 docs/PROJECT_STATUS_AND_HANDOFF.md，恢复 Session C 外部平台验收。只使用受保护环境中的 Apple Developer ID/notarization 或 Windows Authenticode 凭据，不在聊天中传递私钥；不要把 CI 构建成功当作 Windows 实机通过，所有签名、摘要和安装证据必须来自同一候选。

### Session D：UX、可访问性与窗口适配（已完成）

状态：已完成。没有新增产品模块、IPC、migration、系统权限或 ADR；完整证据和下一 Session 提示见 `docs/SESSION_D_SUMMARY_AND_NEXT_PROMPT.md`。

已完成范围：

- 可拖动导航/列表/详情面板和布局记忆。
- 1280×720、小于推荐尺寸、200% 缩放、长文本和超多标签。
- 全页面 Tab 顺序、焦点回归、状态播报、屏幕阅读器标签。
- 空、加载、失败、离线、禁用和减少动效状态统一。
- 调整首页 Hero 和卡片密度，但保留当前四色语义与克制玻璃方向。

已通过验收：

- 不使用鼠标可以完成搜索、选模板、建题、关联、关闭对话框和确认计划。
- 面板尺寸重启后恢复，极端尺寸有安全下限和重置布局入口。
- 亮暗主题对比度、200% 缩放和减少动效通过人工检查。
- Playwright 保留核心窗口截图并加入键盘/焦点测试。

限制：macOS VoiceOver 未做长时间真人任务审计；Windows Narrator、高对比模式和 Windows 实机缩放仍未验证。

### Session E：性能与大型工作区

状态：已完成。完整性能表、机器条件和隐私边界见 `docs/PERFORMANCE_BASELINE.md`；提交与下一 Session 提示见 `docs/SESSION_E_SUMMARY_AND_NEXT_PROMPT.md`。

已完成范围：

- 确定性 1k/5k/10k 模板、题目、图片元数据和关系夹具；单命令记录 5 次 P50/P95、RSS 和取消耗时。
- migration `0006_performance_indexing`、索引版本 `1`、完整 SHA-256、纳秒变化令牌、规范化哈希和相似度签名。
- 新增/修改/移动/删除差量发布；移动保持稳定 ID、元数据和题目关系，歧义不猜测。
- Main 后台扫描/审计任务、阶段计数、重复任务复用、用户取消和退出安全终止。
- 模板、题目、模板关系、计划与执行历史键集分页；题目超过 100 条虚拟化，小工作区保留原生 DOM。
- 审计复用持久化索引；AI 上下文使用批量元数据和关系聚合 SQL。

最终证据：

- `npm run check`：201 项 Vitest + 3 项发布脚本测试通过。
- `npm run test:e2e`：54 项常规 Electron E2E 通过，2 项 packaged 按条件跳过。
- 10k：启动 P50/P95 1923.12/2349.86 ms；无变化重扫 805.45/1045.77 ms，`0` 哈希、`10,000` 复用；取消 0.27/0.59 ms。
- 10k：题目首批 3.09/13.70 ms、详情 0.18/0.20 ms、审计 78.81/93.45 ms、AI 候选 135.84/151.81 ms。
- macOS arm64 截图覆盖大型模板/题目分页、搜索、1024×640 亮暗主题和减少动效；Session D 的 200% 与完整尺寸矩阵继续通过。

限制：首次扫描因完整哈希、签名和状态复检比旧实现更重；Windows 大工作区实机仍未验证；本 Session 未重新打包。

### Session F：代码健康与文档发布候选

状态：已完成并冻结。第一至第十切片已完成 `App.tsx`、模板管理服务、AI Provider、题目分析关联、题目详情、文件管理历史/计划审查/只读审计和数据管理备份/恢复/异常中断恢复拆分；第十切片以 `b8f4456` 为基线完成异常中断恢复展示区拆分，特征测试提交为 `289e665`，代码提交为 `436ff70`。本次仅补齐收尾文档、源码门禁与 unsigned beta 证据，不新增功能、不重构业务代码、不调整视觉系统。

目标：在功能稳定后降低长期维护成本，并统一项目事实来源；该目标已完成，Session F 不再循环拆分。

已完成范围：

- 行为不变地拆分 `App.tsx`、模板管理服务和大型页面组件。
- 为拆出的领域逻辑补单元测试。
- 建立 `CHANGELOG.md`，同步 README、用户指南、发布、安全和 ADR 索引。
- 统一版本号与发布候选清单。

冻结规则：除真实 Bug、用户反馈或发布门禁外，不再开启第十一切片或其他维护性拆分；重新开启时必须先记录触发证据和最小范围。

第一切片已完成：

- `App.tsx` 从约 1,630 行缩减到约 292 行，只保留状态协调、领域动作和最终组合。
- `app-navigation.ts` 与 `app-route.ts` 提供纯逻辑边界并新增 8 项测试；`app-shell.tsx` 承载布局状态和窗口框架；`app-dialogs.tsx` / `use-app-dialogs.ts` 承载受控对话框与焦点返回；`app-workspace-route.tsx` 承载领域页面装配。
- Dashboard、模板库和工作区不可用状态移入语义目录；没有新增依赖、数据库/IPC/权限/视觉变化。
- `npm run check` 通过 209 项 Vitest 与 3 项发布脚本测试；完整 Electron E2E 54 项通过、2 项 packaged 按条件跳过。
- 本切片没有重新打包；当前目录包继续来自 `4c13dc8`，不把源码 HEAD 与目录包来源混为同一证据。

第二切片已完成：

- `src/main/services/template-management-service.ts` 从 2,325 行缩至 872 行（约 870 行），继续保留所有 IPC façade 方法和构造参数。
- 新增 `template-workspace-audit-service.ts`、`template-file-plan-generation-service.ts`、`template-file-plan-safety.ts`、`template-file-plan-executor.ts`、`template-file-plan-history-service.ts`，另将稳定常量、语言校验和共享路径/元数据工具单独归位。
- 新增 2 项特征测试，锁定规范化重复组的 keeper 顺序与审计取消不发布结果；原有文件计划、模板移动、批量导入、AI 结构化输出、备份/撤销和增量索引 E2E 全部保持通过。
- 本切片没有改变 SQLite schema、migration、IPC 名称、后台任务协议、Zod 契约、文件备份格式、Provider 协议、系统权限或视觉 token，也没有新增 ADR。
- `npm run check` 实际为 31 个 Vitest 文件/211 项、3 项发布脚本测试；`npm run test:e2e` 为 54 项通过、2 项 packaged 条件跳过。
- 性能命令 `PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance` 通过；报告 `output/performance/session-e-session-f-template-service-split-final.md`，10k 启动 `2990.48/3200.29 ms`、无变化重扫 `672.21/732.82 ms`、审计 `87.94/90.36 ms`、AI 候选 `144.00/158.31 ms`、取消 `0.27/0.39 ms`，增量索引 `hashed=0`、`reused=unchanged=10,000`。
- 全新 userData、已有 V2 userData、旧 schema 原位 migration、异常中断恢复、外部修改拒绝和文件补偿回滚继续由现有测试覆盖；证据仍为 macOS arm64。未重新打包，Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

第三切片已完成：

- 先新增 `ai-provider-workspace.test.tsx` 3 项特征测试，锁定更新时保留密钥、请求头/超时请求构造、任务路由调用、预设创建与无效请求头阻断，再移动实现。
- `ai-provider-workspace.tsx` 从 745 行降至 246 行；`ai-provider-editor.tsx`、`ai-provider-list.tsx` 和 `ai-provider-form.ts` 分别承载编辑展示、列表选择和纯表单逻辑。
- `use-ai-providers.ts` 未修改，仍是唯一命名 Preload 调用层；没有数据库、migration、IPC、Zod、Provider 协议、密钥语义、布局、焦点、键盘、live region 或视觉 token 变化。
- `npm run check` 实际为 32 个 Vitest 文件/214 项、3 项发布脚本测试；`npm run test:e2e` 为 54 项通过、2 项 packaged 条件跳过。
- Provider 亮色、紧凑和深色截图由本次 E2E 重新生成并人工复核，无视觉变化；扫描/查询/启动路径未变，因此没有重跑性能基准。
- 开始时 Keychain 仍为 `0 valid identities found`，签名/公证环境组不完整且没有 Windows 实机，因此没有恢复 Session C 外部门禁；本切片未重新打包。

第四切片已完成：

- 先新增 `problem-analysis-dialog.test.tsx` 3 项组件特征测试，锁定手动标签去重和关系筛选、AI 预览/分析/只补空字段/高置信候选选择，以及生成中关闭先取消活动请求。
- `problem-analysis-dialog.tsx` 从 969 行降至 826 行；新增 193 行的 `problem-analysis-relations.tsx`，完整承载模板搜索、手动选择、候选勾选、关系类型/备注和移除展示。
- 新组件只接收受控 props 与回调，不访问 `window.desktop`；题目分析预览、取消、分析和原子提交仍由原对话框调用命名 Preload API。
- `npm run check` 实际为 33 个 Vitest 文件/217 项、3 项发布脚本测试；`npm run test:e2e` 为 54 项通过、2 项 packaged 条件跳过。沙箱内首次 E2E 的 GUI/本地端口 `EPERM` 在授权后完整重跑通过，不属于应用失败。
- 题目分析 1440×900、1280×720 的亮暗截图由本次 E2E 重新生成并人工复核；关联区 DOM/class、滚动、焦点、主题和主操作无视觉变化，Session D 的 1024×640/200% 矩阵继续有效。
- 本切片没有数据库、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖变化。扫描/查询/启动路径未受影响，因此没有重跑性能基准，也没有重新打包。
- 当前实时检查仍为 `0 valid identities found`，主机为 Darwin arm64 且没有 Windows 实机；签名、公证、Windows 实机、VoiceOver 长流程和 Windows 辅助技术验收继续未完成。

第五切片已完成：

- 先新增 `problem-workspace.test.tsx` 3 项详情调用特征测试，锁定可用模板打开、解除关联二次确认、添加图片和删除二次确认，再移动详情实现。
- `problem-workspace.tsx` 从 904 行降至 539 行；新增 405 行的 `problem-details-panel.tsx`，完整承载题目头部、题面/摘要/备注、结构化分析、模板关联、图片卡片以及删除/解除关联确认。
- 父工作区继续承载列表、搜索、虚拟滚动、分页、键盘导航、`ResizableLayout`、空状态和编辑/关联/AI 对话框装配；详情组件只接收受控数据与回调，不访问 `window.desktop`、Node、SQLite、文件系统或密钥。
- `npm run check` 实际为 34 个 Vitest 文件/220 项、3 项发布脚本测试；`npm run test:e2e` 为 54 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过。定向题目工作区测试 2 个文件/6 项通过。
- 重新生成并人工复核 `output/playwright/session-e-problem-page-1024x640-light.png`、`output/playwright/session-e-problem-page-1024x640-dark.png`、`output/playwright/unified-problem-multi-template-light-1280x720.png` 和 `output/playwright/unified-problem-multi-template-dark-1440x900.png`；详情区 DOM/class、滚动、焦点、主题和主操作无视觉变化，既有矩阵继续有效。
- 本切片没有数据库、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖变化。扫描/查询/启动路径未受影响，因此没有重跑性能基准，也没有重新打包。
- 当前实时检查仍为 `0 valid identities found`，主机为 Darwin arm64 且没有 Windows 实机；签名、公证、Windows 实机、VoiceOver 长流程和 Windows 辅助技术验收继续未完成。

第六切片已完成：

- 先新增 `file-management-workspace.test.tsx` 3 项职责/调用特征测试，锁定历史区域键盘导航、计划归档/重新草拟和执行记录回滚/删除确认，再移动历史实现。
- `file-management-workspace.tsx` 从 1,156 行降至 861 行；新增 403 行的 `file-management-history-panel.tsx`，完整承载计划历史、执行记录、分页按钮、键盘滚动、归档/删除/回滚确认和受控回调。
- 父工作区继续承载工作区审计、AI 请求预览/生成/取消、待确认计划、所有命名 Preload 调用、任务状态、错误/成功播报和数据刷新；新组件不访问 `window.desktop`、Node、SQLite、文件系统或密钥。
- `npm run check` 实际为 35 个 Vitest 文件/223 项、3 项发布脚本测试；`npm run test:e2e` 为 54 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过，总耗时约 2.6 分钟。
- 重新生成并人工复核 `output/playwright/file-plan-delete-confirm-light-1440x900.png`、`output/playwright/file-plan-delete-confirm-light-1280x720.png`、`output/playwright/file-plan-delete-confirm-dark-1280x720.png` 和 `output/playwright/file-plan-delete-confirm-dark-1440x900.png`；历史区 DOM/class、滚动、焦点、主题和主操作无视觉变化，既有 1024×640/200% 矩阵继续有效。
- 本切片没有数据库、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖变化。扫描/查询/启动路径未受影响，因此没有重跑性能基准，也没有重新打包。
- 当前实时检查仍为 `0 valid identities found`，主机为 Darwin arm64 且没有 Windows 实机；签名、公证、Windows 实机、VoiceOver 长流程和 Windows 辅助技术验收继续未完成。

第七切片已完成：

- 先新增 `file-management-workspace.test.tsx` 3 项职责/调用特征测试，锁定操作分组/Diff/独立勾选、两类空状态、取消/诊断调用和执行二次确认焦点/参数，再移动实现。
- `file-management-workspace.tsx` 从 861 行降至 654 行；新增 269 行的 `file-management-plan-review-panel.tsx`，完整承载操作分组与 Diff、勾选状态、无计划/零操作空状态、取消/诊断按钮和执行二次确认。
- 父工作区继续承载工作区审计、AI 请求预览/生成/取消、默认勾选种子、全部命名 Preload 调用、计划执行、任务状态、错误/成功播报和数据刷新；新组件不访问 `window.desktop`、Node、SQLite、文件系统或密钥。
- `npm run check` 实际为 35 个 Vitest 文件/226 项、3 项发布脚本测试；最终 `npm run test:e2e` 单次完整运行 54 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过，总耗时约 3.3 分钟。沙箱内 Electron/本地端口 `EPERM` 与授权后首次运行的一次弹窗 X 命中时序波动，均由定向及最终完整重跑排除为产品回归。
- 重新生成并人工复核 `output/playwright/stage5-file-plan-light.png`、`output/playwright/stage5-file-plan-light-1280x720.png` 和 `output/playwright/stage5-file-plan-dark.png`；计划区 DOM/class、分组、Diff、复选框、滚动、焦点、主题和主操作无视觉变化，既有 1024×640/200% 矩阵继续有效。
- 本切片没有数据库、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token、依赖或 ADR 变化。扫描/查询/启动路径未受影响，因此没有重跑性能基准，也没有重新打包。
- 当前实时检查仍为 `0 valid identities found`，主机为 Darwin 25.5.0 arm64 且没有 Windows 实机；签名、公证、Windows 实机、VoiceOver 长流程和 Windows 辅助技术验收继续未完成。

第八切片已完成：

- 先新增 `file-management-workspace.test.tsx` 3 项职责/调用特征测试，锁定运行中计数与取消任务调用、问题分类/路径/确定性说明，以及无问题空状态、截断提示、下一步和 40 条展示边界，再移动实现。
- `file-management-workspace.tsx` 从 654 行降至 573 行；新增 99 行的 `file-management-audit-panel.tsx`，完整承载审计进度、结果时间、截断信息、问题列表和无问题空状态。
- 父工作区继续承载 `startAudit`、后台任务轮询/取消、审计状态发布、AI 预览/生成/取消、全部命名 Preload 调用、任务状态、错误/成功播报和数据刷新；新组件不访问 `window.desktop`、Node、SQLite、文件系统或密钥。
- `npm run check` 实际为 35 个 Vitest 文件/229 项、3 项发布脚本测试；`npm run test:e2e` 单次完整运行 54 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过，总耗时约 3.1 分钟。
- 重新生成并人工复核 `output/playwright/stage5-file-plan-light.png`、`output/playwright/stage5-file-plan-light-1280x720.png` 和 `output/playwright/stage5-file-plan-dark.png`；只读审计区 DOM/class、计数、问题分类、内部滚动、侧栏排列和主题无视觉变化，既有 1024×640/200% 矩阵继续有效。
- 本切片没有数据库、migration、IPC/Zod、后台任务种类/协议、备份格式、Provider 协议、安全上限、布局偏好、视觉 token、依赖或 ADR 变化。扫描/查询/启动和后台任务实现未受影响，因此没有重跑性能基准，也没有重新打包。
- 当前实时检查仍为 `0 valid identities found`，主机为 Darwin 25.5.0 arm64 且没有 Windows 实机；签名、公证、Windows 实机、VoiceOver 长流程和 Windows 辅助技术验收继续未完成。

第九切片已完成：

- 基线：`d942ce4 docs: hand off session f file management audit split`；先行特征测试提交：`361a7b6 test: characterize data backup restore workspace`；源码提交：`85064b6 refactor: split data backup restore panel`。
- `data-management-workspace.tsx` 从 1,164 行降至 1,029 行；新增 194 行 `data-backup-restore-panel.tsx`，承载导出范围勾选、导出/校验/恢复预览按钮、manifest/校验结果、恢复冲突、确认焦点和恢复结果展示。父工作区继续承载生命周期、异常中断恢复、隔离/撤销、所有 `dataManagement` 调用、诊断刷新、错误/成功播报和最终组合。
- 先新增 3 项特征测试，锁定导出源码范围与 manifest 展示、独立校验调用、恢复预览后确认复选框焦点、`templateSourceStrategy: 'skip'` 精确请求、恢复后诊断刷新和 Provider 密钥重填播报；实现前后定向测试均通过。
- `npm run check` 通过 36 个 Vitest 文件/232 项与 3 项发布脚本测试；TypeScript、ESLint 0 warnings、Prettier 均通过。`npm run test:e2e` 在授权 GUI/本地 mock 端口后通过 54 项常规真实 Electron E2E，2 项 packaged 条件跳过，总耗时约 2.7 分钟；首次沙箱 `EPERM` 已分类为环境限制。
- 数据管理真实 Electron 导出/恢复流程继续通过；本切片没有视觉意图，复用并人工复核 `output/playwright/session-d-final/` 的 1440×900、1280×720、1024×640、200% 亮暗数据管理截图矩阵，DOM/class、滚动、焦点、live region 和主题 token 不变。
- 兼容性：全新 userData、已有 V2 userData、旧 schema migration、恢复前备份、故障回滚和中断恢复由现有 E2E 继续覆盖；没有改变 SQLite schema、migration、IPC/Zod、备份格式、后台任务、Provider 协议、安全上限、依赖或权限。扫描/查询/索引/分页/启动路径未受影响，未重跑性能基准；最近性能证据仍为 `output/performance/session-e-session-f-template-service-split-final.md`。
- 平台限制（第九切片结束时）：`security find-identity -v -p codesigning` 仍为 `0 valid identities found`；当前主机为 macOS arm64，没有真实 Windows 安装环境。正式签名/notarization、Windows Authenticode/安装验收、VoiceOver 长流程和 Windows Narrator/高对比实机检查仍未完成；该切片未重新打包。
- 交接时工作树只保留用户已有未跟踪 `问题反馈.txt`；`.codex/config.toml` 未修改、未暂存，旧项目未触碰，也未推送远程。

第十切片已完成：

- 基线：`b8f4456 docs: hand off session f data backup split`；先行特征测试提交：`289e665 test: characterize interrupted recovery workspace`；源码提交：`436ff70 refactor: split interrupted recovery panel`。
- `data-management-workspace.tsx` 从 1,029 行降至 889 行；新增 190 行 `data-interrupted-recovery-panel.tsx`，承载异常中断条目、可恢复/受保护状态、动作/原因标签、恢复预览、阻止说明、显式确认和加载态。父工作区继续承载生命周期刷新、隔离治理、所有 `dataManagement` 调用、恢复结果发布、重新诊断、错误/成功播报和最终组合。
- 先新增 3 项特征测试，锁定可恢复/受保护入口与精确预览 ID、状态变化时阻止确认/恢复，以及显式确认后的精确 `confirmRecovery: true`、`operationId`、`retentionPolicy` 请求、诊断刷新和成功播报；实现前后定向 6 项测试均通过。
- `npm run check` 通过 36 个 Vitest 文件/235 项与 3 项发布脚本测试；TypeScript、ESLint 0 warnings、Prettier 均通过。`npm run test:e2e` 首次沙箱运行因 Electron GUI/本地端口 `EPERM` 失败，授权后完整 Playwright 结果为 `passed` 且无失败测试，即 54 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过。
- 数据管理中断恢复真实 Electron E2E 继续覆盖中断隔离退回、SQLite 提交前恢复旧状态和提交后完成新状态；本切片没有视觉意图，复用并人工复核 `output/playwright/session-d-final/` 的 1440×900 亮暗、1024×640 紧凑和 200% 深色数据管理原图，DOM/class、滚动、焦点、live region 和主题 token 不变。
- 兼容性：全新 userData、已有 V2 userData、旧 schema migration、恢复前备份、故障回滚和中断恢复由现有 E2E 继续覆盖；没有改变 SQLite schema、migration、IPC/Zod、备份/中断恢复格式、后台任务、Provider 协议、安全上限、依赖或权限。扫描/查询/索引/分页/启动路径未受影响，未重跑性能基准；最近性能证据仍为 `output/performance/session-e-session-f-template-service-split-final.md`。
- 平台限制（第十切片结束时）：`security find-identity -v -p codesigning` 仍为 `0 valid identities found`；当前主机为 Darwin 25.5.0 arm64，没有真实 Windows 安装环境。正式签名/notarization、Windows Authenticode/安装验收、VoiceOver 长流程和 Windows Narrator/高对比实机检查仍未完成；该切片未重新打包，最终收尾另有 unsigned beta 证据。
- 交接时工作树只保留用户已有未跟踪 `问题反馈.txt`；`.codex/config.toml` 未修改、未暂存，旧项目未触碰，也未推送远程。

验收：

- 每个拆分提交可独立审查且完整门禁通过。
- 不改变 IPC 和数据库契约，或在独立 ADR/提交中明确升级。
- README 不再包含过时版本、测试数字或 ADR 范围。
- 文档明确区分源码版本、最后已打包版本和最后正式签名版本。

Session F 已结束，不再生成“继续第十一切片”的启动提示。下一次任务仅在真实 Bug、用户反馈、Apple Developer ID/notarization 凭据或真实 Windows 实机出现时重新建立；届时先重新执行基线检查和范围审查，保持 `.codex/config.toml`、`问题反馈.txt`、旧项目和远程仓库的保护规则。

## 10. 推荐执行顺序和依赖

```text
Session A 数据可靠性
  -> Session B AI 稳定性
  -> Session C 候选自动化
     -> 签名/公证/Windows 实机（等待外部条件）

Session D UX/可访问性（完成） ─┐
Session E 性能（完成）         ├-> Session F 代码健康与文档发布候选
Session A/B/C                  ┘
```

- Session A、B、C 自动化与 Session D/E 均已完成；签名、公证和 Windows 实机证据等待证书、账号与硬件。
- Session F 已完成并冻结；无外部发布条件时不再继续维护性拆分。
- 仅在真实 Bug、用户反馈或外部签名/Windows 条件齐备时恢复相应门禁，并保持 Session D 的布局/键盘/focus/live 与 Session E 的增量索引、取消、分页和基准回归。

## 11. 每个 Session 的统一交接格式

结束前必须在最终回复或对应文档中记录：

1. 基线提交、结束提交和工作区未提交状态。
2. 完成的产品需求与明确未完成项。
3. 修改的契约、IPC、migration、文件格式和用户数据影响。
4. 执行的 typecheck、lint、单元测试、E2E、截图和平台测试。
5. 全新 userData、已有 V2 userData 和异常中断三类兼容结论。
6. 风险、平台限制、后续 Session 的依赖与建议启动提示。
7. 明确说明是否排除了 `.codex/config.toml` 与 `问题反馈.txt`。

## 12. 下一阶段产品方向

短期目标应定义为“可信的本地算法知识工作台 0.2”，不是继续横向增加 AI 功能。0.2 的标志是：数据可以验证地备份恢复、AI 失败可诊断、跨平台安装可信、核心流程可键盘操作、大型工作区不会无提示截断。

完成这些基础后，再考虑自动更新、模型枚举、成本提示、收藏/历史和更高效的知识复习入口。账号、云同步、在线判题和社区市场会改变威胁模型与产品边界，除非有独立需求和架构决策，否则继续保持不做。
