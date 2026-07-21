# 质量门禁

## 基础门禁

- TypeScript 无错误。
- ESLint 无新增错误。
- 格式检查通过。
- 单元测试通过。
- 受影响的 Playwright E2E 通过。
- Electron 可以从开发入口真实启动。

当前累计基线（2026-07-21，Session F 第九切片代码提交 `85064b6`）：36 个 Vitest 文件中的 232 项测试与 3 项发布脚本测试通过；常规真实 Electron E2E 54 项通过，2 项 packaged 测试在未设置 `PACKAGED_APP_PATH` 时按条件跳过。最近 macOS arm64 目录包仍来自 Session E 后续修复 `4c13dc8`，全新与已有 V2 userData 的 2 项 packaged smoke 已单独通过；Session F 未重新打包。测试数量随功能增长会变化，发布判断以当次命令结果为准。

## 核心 E2E 场景

1. 使用全新应用数据目录首次启动，创建空白模板工作区并完成第一个模板入库。
2. 选择已有模板目录，只读显示数量与异常但不修改文件。
3. 搜索模板并从结果定位到折叠后的树节点。
4. 打开算法卡片、复制代码、编辑允许修改的元数据。
5. 新建题目卡片并关联多个模板。
6. 上传题目截图，AI 返回草稿，用户确认后保存题目和关联。
7. 添加自定义 AI Provider，测试连接并选择任务模型。
8. AI 生成文件整理计划，预览后取消时文件不发生变化。
9. 确认一项文件变更，数据库与文件系统保持一致。
10. 断网或供应商失败时，模板查询和题目浏览仍可用。
11. 批量选择或扫描 `.cpp` 后默认全选并可逐份取消；没有 AI 元数据也能按可编辑路径导入。目标冲突逐项支持跳过、改名或明确覆盖；覆盖前备份，任一步失败整批恢复，外部源文件始终不变。
12. 644 份模板、126 道题、110 条单模板关系及 105 条计划/执行记录通过真实 IPC 键集分页完整遍历，无重复、无静默 100 条截断；搜索可定位首批之外模板。
13. 增量扫描覆盖无变化、mtime 恢复后的同长度改写、移动、删除、符号链接、中途变化和用户取消；取消后 SQLite 统计与用户源码保持不变。

## UI 验收

- 亮色与深色主题。
- 1024×640、1280×720、1440×900、200% 缩放和高分屏窗口。
- 默认、加载、空、错误、离线和禁用状态。
- 键盘可完成全局搜索、模板选择、题目创建/关联、文件计划确认、树/菜单/历史列表导航和关闭对话框。
- 可调整面板必须覆盖鼠标拖动、方向键、Shift 加速、Home/End、Enter/Space/双击重置、重启恢复、异常值回退和全局重置。
- 对话框打开后焦点进入有效首项，关闭后回到触发器；异步焦点恢复不得覆盖用户新选择的控件。
- 关闭按钮的 `X` SVG 不得截获鼠标；自动化必须从 `X` 笔画中心执行真实鼠标点击，并确认命中元素是按钮、浮层退出且焦点返回触发器。
- 页面切换、成功、失败、AI 取消、计划完成和恢复结果必须使用不泄露正文的 `status` / `alert` / `aria-live` 播报。
- 焦点可见，对比度可读，功能反馈不只依赖颜色；减少动效设置关闭非必要位移和缩放。
- 长工作区名、长相对路径、长标题、连续长题面、超多标签和大量列表不能造成 document 横向溢出或不可达主操作。
- 对核心页面保留基线截图；视觉变化必须有意图说明。

### Session D 自动化与截图证据

- `tests/e2e/accessibility-layout.spec.ts` 7 项通过：鼠标/键盘 resize、安全边界、真实重启恢复、异常值回退、重置、焦点回归、页面播报、长内容全键盘流程、真实 1024×640、200% 主操作在视口内和减少动效。
- `tests/e2e/scroll-and-code-viewer.spec.ts` 验证 48 个虚拟目录使用 End/Home 在模板树内部滚动；36 个题目的列表、长题面详情和编辑字段区分别使用真实鼠标滚轮与滚动条拖动，面板不得按内容高度撑开后被外层裁切。
- `tests/e2e/file-management.spec.ts` 验证键盘聚焦并确认计划、取消生成零写入、外部修改整批拒绝、执行/备份/关系稳定与回滚。
- `tests/e2e/app.spec.ts` 使用真实 600×4000 PNG 验证长图默认按宽度滚动到底、整图概览、200% 工具栏可达和 Escape 焦点回归。
- `tests/e2e/app.spec.ts` 直接点击新建模板、新建题目和长图预览的 `X` 图标中心；滚动 E2E 同样点击编辑题目的 `X` 中心，验证 `elementFromPoint` 命中按钮、pointer 光标、退出成功和焦点回归。
- `tests/e2e/template-intake.spec.ts` 额外要求新建模板卡片和遮罩计算为 `-webkit-app-region: no-drag`，并分别在刚打开、切换“补全语言”后从 `X` 图标中心关闭。定向 packaged 回归覆盖同一契约；真实 macOS 鼠标验收必须使用隔离 bundle ID，避免同名旧进程造成误判。
- `tests/e2e/problem-analysis.spec.ts` 7 项通过：AI 发送预览空闲时点击 `X`、按 Escape，以及生成中点击 `X` 均退出整张题目卡片；题目主 `X` 与预览 `X` 在忙碌状态均断言为 enabled，生成中退出会关闭本地 mock 连接且零题目写入，“取消生成”仍保留草稿。
- `tests/e2e/file-management.spec.ts` 另验证未撤销执行不可删除、混合批次整批拒绝、单条/批量确认焦点，以及删除后数据管理执行记录计数从 1 同步为 0。
- 最终截图目录：`/Users/ffxx/Desktop/项目/智能算法学习助手-v2/output/playwright/session-d-final/`。
- 必须人工复核四页面 1440×900、1280×720、1024×640 的亮暗主题以及 200% 关键状态；联系图只能辅助浏览，不能替代原始截图。
- 当前屏幕阅读器限制：已有语义树、accessible name、键盘和 live region 自动化；macOS VoiceOver 长流程真人审计、Windows Narrator 与高对比模式仍未完成，不能宣称跨平台辅助技术完全通过。

### Session E 性能门禁

- 基准必须通过 `npm run benchmark:performance` 单命令生成 1k/5k/10k 临时夹具；每项至少 3 次，正式报告使用 5 次并记录 P50/P95 与 RSS。输出不得含源码、题面、绝对路径、API Key 或 Provider 正文。
- 无变化重扫必须证明 `hashedCount = 0` 且 `reusedCount = unchangedCount = templateCount`；强制完整重扫结果与增量公开结果确定性一致。
- 内容变化但 mtime 恢复、唯一移动、删除、符号链接、读取失败/中途变化和取消必须有自动化证据；任何失败不得发布半完成索引。
- 模板/题目/历史分页必须使用 Main 校验的不透明键集游标；Renderer 不得提交 OFFSET、SQL 或任意排序字段。
- 仍存在的上限必须显示已处理数、总数/未知、截断原因和下一步。大题目列表保留 Arrow、Home/End、Enter/Space；小工作区原生滚动条回归继续通过。
- UI 截图至少覆盖大型模板首批/搜索、题目分页的 1440×900、1024×640、亮暗主题和减少动效；既有 Session D 1280×720、200% 与全页面矩阵继续作为回归证据。

## 安全验收

- Renderer 无 Node 权限，不存在原始 IPC 暴露。
- IPC 参数经过 schema 校验，文件路径经过授权根目录校验。
- API Key 不出现在数据库、日志、错误信息、测试快照和截图中。
- Renderer 不接收已保存 API Key 或密文，只接收 `hasSecret`；连接测试只发送固定探测提示。
- 外链和自定义 API 地址经过协议校验。
- 除本机 Ollama 外，Provider 使用 HTTPS；自定义请求头不能覆盖鉴权或传输敏感头。
- 删除、覆盖、批量移动和 AI 文件计划需要明确确认。
- 文件计划执行前创建应用内备份；撤销前检查路径占用和执行后的外部修改，禁止覆盖后续用户数据。

## 全新安装与数据升级验收

- 不存在旧项目、旧数据库或预置模板时，应用可以正常启动并完成首次设置。
- 空白模板工作区具有可操作的空状态，用户可以手动创建第一份模板和题目。
- 选择已有目录不会自动重命名、移动、覆盖或删除其中的文件。
- 安装包和默认应用数据不包含开发者的个人路径、模板、题目、Provider 或密钥。
- V2 schema migration 有升级测试和必要的回滚/备份策略，不依赖删除数据库重新生成。

## 发布门禁

- macOS/Windows 产物由平台 runner 构建，原生 SQLite 与当前 Electron ABI 匹配。
- 使用全新应用数据目录和已经写入 V2 数据的目录分别运行打包后二进制 smoke test；旧 schema migration 由完整 E2E 独立覆盖。
- DMG/安装包结构、Info.plist/文件版本、App 与 better-sqlite3 架构、SHA-256、SBOM、隐私扫描和签名状态在同一次发布流程中验证并记录。
- 发布脚本只按 `package.json` 精确选择当前版本/平台/架构制品，不得用宽泛 glob 混入 `release/` 中的历史版本。
- `preview` 必须主动移除签名环境并明确标记未签名；`signed` 缺证书、公证凭据或最终签名证据时必须失败关闭。
- 公开发布必须完成平台代码签名；未签名产物只能标记为开发预览。
- Windows 正式质量声明必须有真实 Windows 安装、启动、升级与卸载证据，不能只依赖交叉构建或 CI 产物。

## Session D 最终实测（2026-07-18）

| 命令/证据          | 结果                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `npm run check`    | 通过：TypeScript、ESLint 0 warnings、Prettier、26 个 Vitest 文件/190 项测试、3 项发布脚本测试                |
| `npm run test:e2e` | 通过：50 项常规 Electron E2E；2 项 packaged 因未重新生成目录包而按条件跳过；总耗时约 2.3 分钟                |
| Session D 定向 E2E | 7 项布局/可访问性、4 项文件计划、滚动/代码查看和应用主流程均通过                                             |
| 截图矩阵           | 32 张四页面尺寸/主题/200% 原图，加减少动效、分隔条焦点和 4 张联系图，已人工复核                              |
| 打包               | 本 Session 未重新打包；没有复用 Session C 旧候选摘要，Session C 发布脚本仍由 `npm run check` 的 3 项测试保护 |

## Session D 后续修复实测（2026-07-18）

| 命令/证据                       | 结果                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                 | 通过：TypeScript、ESLint 0 warnings、Prettier、27 个 Vitest 文件/195 项测试、3 项发布脚本测试                          |
| `npm run test:e2e`              | 通过：52 项常规 Electron E2E；2 项 packaged 未设置路径时按条件跳过；最终全量重跑约 2.4 分钟                            |
| 长图与执行记录定向 Electron E2E | `app.spec.ts` 9 项、`file-management.spec.ts` 4 项通过；真实 Main/Preload/Renderer 与 SQLite 路径均覆盖                |
| 题目卡片滚动与关闭 Electron E2E | 题目列表、详情、编辑表单均通过滚轮和滚动条拖动；新建/编辑 `X` 中心点击命中按钮、关闭并恢复焦点                         |
| AI 发送预览关闭 Electron E2E    | 预览 `X`/Escape 退出整卡；生成中 `X` 命中按钮、取消连接、零写入并回焦；底部取消继续保留草稿                            |
| Repository/契约                 | 9 项定向测试通过；覆盖 UUID 去重/边界、工作区/状态全量校验和删除中途失败的事务回滚                                     |
| 截图                            | 新增 2 张 1024×640 题目详情/编辑滚动图；原 6 张长图/亮暗删除确认/数据同步关键图继续保留并人工复核                      |
| migration / Renderer 权限       | 本次滚动/关闭修复无 migration、IPC、系统权限或 ADR；Renderer 仍无 Node/SQLite/文件系统权限                             |
| 目录包                          | 从 `e46235e` 执行 `package:dir`；全新与已有 V2 userData packaged smoke 2 项通过，并通过隔离 bundle ID 的真鼠标关闭验收 |

## Session E 最终实测（2026-07-19）

| 命令/证据               | 结果                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run check`         | 通过：TypeScript、ESLint 0 warnings、Prettier、28 个 Vitest 文件/201 项、3 项发布脚本测试                          |
| `npm run test:e2e`      | 通过：54 项常规 Electron E2E；2 项 packaged 未设置路径时按条件跳过                                                 |
| `benchmark:performance` | 1k/5k/10k、每项 5 次；10k 启动 P50/P95 1923.12/2349.86 ms，无变化重扫 805.45/1045.77 ms，取消 0.27/0.59 ms         |
| 增量工作量              | 10k 无变化 `0` 哈希、`10,000` 复用；强制完整 `10,000` 哈希；取消不改变 `scan_stats_json`                           |
| 大列表 Electron E2E     | 644 模板、126 题、110 关系、105 计划和 105 执行记录全部键集遍历且 ID 唯一；首批外模板可搜索定位                    |
| UI/键盘/截图            | 大型模板/题目分页、Arrow/Home/End、滚轮与原生滚动条通过；新增 1440×900 亮色、1024×640 亮暗和 1280×720 减少动效截图 |
| migration / userData    | 全新 userData、旧 stage-1 schema、已有结构化题目 schema 均原位升级；索引失败/取消保留上一完整版本                  |
| 打包与平台              | 本 Session 未执行 `package:dir`，未复用旧候选摘要；证据为 macOS arm64，Windows 大工作区实机仍未验证                |

## Session F 第一切片实测（2026-07-19）

| 命令/证据            | 结果                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`      | 通过：30 个 Vitest 文件/209 项测试、3 项发布脚本测试；TypeScript、ESLint 0 warnings、Prettier 全部通过                                                                                |
| `npm run test:e2e`   | 通过：54 项常规 Electron E2E；2 项 packaged 未设置路径时按条件跳过；完整重跑约 2.6 分钟                                                                                               |
| 针对性 Renderer 测试 | 4 个文件/19 项通过；覆盖 App、快捷键解析、工作区路由优先级和代码查看器回归                                                                                                            |
| 拆分边界             | `App.tsx` 约 292 行；无数据库字段、migration、IPC、后台协议或系统权限变化                                                                                                             |
| 目录包               | 未重新打包；继续使用上一已验证目录包 `release/mac-arm64/算法学习工作台.app`                                                                                                           |
| 性能 smoke           | 正式 1k/5k/10k 每项 5 次通过；当前启动 P50/P95 为 3276.85/3534.93、3493.57/3510.67、3554.88/3591.87 ms；与同条件临时 `d378a82` 1k 对照 3445.23/3535.73 ms，未观察到拆分导致的启动回归 |

## Session F 第二切片实测（2026-07-19）

- 基线：`18a8f9e docs: hand off session f app split`；代码结束提交：`9c195b6 refactor: split template management plan services`。
- 服务职责已拆为审计、AI 计划生成、计划安全校验、执行/备份/回滚和计划历史五个语义文件；Facade 对外 API 与 IPC 调用保持不变。
- `npm run check`：31 个 Vitest 文件、211 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过。沙箱首次运行的 Electron/本地端口 `EPERM` 已在允许 GUI/端口后重跑，不计为应用失败。
- 性能：`PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance` 通过；原始报告为 `output/performance/session-e-session-f-template-service-split-final.md`。10k 启动 P50/P95 `2990.48/3200.29 ms`，无变化重扫 `672.21/732.82 ms`，审计 `87.94/90.36 ms`，AI 候选 `144.00/158.31 ms`，取消 `0.27/0.39 ms`；`hashed=0`、`reused=unchanged=10,000`。
- 本切片没有新增数据库字段、migration、IPC 名称、后台任务协议、文件备份格式、Zod 契约、权限或视觉 token；未重新打包、未新增截图矩阵。既有 Session D/E 截图和上一目录包只作为未受影响的回归证据。
- 全新 userData、已有 V2 userData、旧 V2 schema migration、文件外部修改复检、取消和异常补偿回滚均由现有 E2E/性能测试继续覆盖；Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第三切片实测（2026-07-19）

- 基线：`671684d docs: record final template service size`；特征测试提交：`bdffac3 test: characterize ai provider workspace`；代码提交：`75aad5f refactor: split ai provider workspace`。
- `ai-provider-workspace.tsx` 从 745 行降至 246 行，页面容器、编辑表单/任务路由、Provider 列表和纯表单转换形成明确职责；`use-ai-providers.ts` 仍是唯一 Preload 调用层。
- 先新增 3 项 Renderer 特征测试，锁定密钥保留、请求构造、任务路由、预设创建和无效请求头阻断；实现提交前定向 2 个测试文件/5 项通过。
- `npm run check`：32 个 Vitest 文件/214 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过；总耗时约 2.5 分钟。
- Provider E2E 重新生成并人工复核 1440×900 亮色、1280×720 紧凑和 1440×900 深色截图；布局、滚动、状态反馈、主题和主操作无视觉变化，Session D 的 1024×640/200% 矩阵继续作为回归证据。
- 本切片没有改变 SQLite schema、migration、IPC、Zod、后台任务、备份格式、Provider 协议、能力/错误边界、密钥语义或安全上限，也未重新打包。
- 扫描、查询、启动、索引和分页路径未受影响，因此没有重跑性能基准；Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第四切片实测（2026-07-19）

- 基线：`6b09f16 docs: hand off session f provider split`；特征测试提交：`f7eb981 test: characterize problem analysis dialog`；代码提交：`ee52a21 refactor: split problem analysis relations`。
- `problem-analysis-dialog.test.tsx` 新增 3 项组件特征测试，覆盖手动标签去重与关系筛选、AI 请求预览/分析/只补空字段/自动勾选候选，以及生成中关闭先取消活动请求。
- `problem-analysis-dialog.tsx` 从 969 行降至 826 行；新增 193 行的 `problem-analysis-relations.tsx`，只负责受控模板搜索、选择、候选勾选、关系类型/备注和移除，不访问 Preload。
- `npm run check`：33 个 Vitest 文件/217 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：沙箱内首次运行因 Electron GUI 与本地 mock 端口被 `EPERM` 拒绝；授权本地 GUI/端口后完整重跑为 54 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过，总耗时约 2.4 分钟。
- 重新生成并人工复核 `unified-problem-multi-template-{light,dark}-{1440x900,1280x720}.png`；关联草稿结构、滚动、亮暗层级、紧凑主操作和焦点边界无视觉变化，Session D 的 1024×640/200% 矩阵继续作为回归证据。
- 本切片没有数据库、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖变化；扫描/查询/启动路径不受影响，因此没有重跑性能基准或目录包。

## Session F 第五切片实测（2026-07-19）

- 基线：`1d196ef docs: hand off session f problem relation split`；特征测试提交：`b2698d4 test: characterize problem workspace details`；代码提交：`0b13ff2 refactor: split problem workspace`。
- `problem-workspace.tsx` 从 904 行降至 539 行；新增 405 行的 `problem-details-panel.tsx`，父工作区保留列表、搜索、虚拟滚动、分页、键盘导航、`ResizableLayout` 和对话框装配，详情组件承载选中题目详情与详情操作确认。
- 先新增 3 项题目工作区详情调用特征测试，再移动实现；定向题目工作区 2 个测试文件/6 项通过，锁定可用模板打开、解除关联确认、添加图片和删除确认调用特征。
- `npm run check`：34 个 Vitest 文件/220 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 2.4 分钟。
- Playwright 重新生成或复用题目工作区的 1024×640 亮色/深色、1280×720 和 1440×900 亮暗截图并人工复核；详情区 DOM/class、滚动、焦点、主题和主操作无视觉变化。扫描、查询、启动和后台任务路径未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖；全新 userData、已有 V2 userData、旧 schema 原位升级和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第六切片实测（2026-07-20）

- 基线：`c4356cd docs: hand off session f problem details split`；特征测试提交：`be85ed6 test: characterize file management history`；代码提交：`e09825a refactor: split file management history panel`。
- `file-management-workspace.tsx` 从 1,156 行降至 861 行；新增 403 行的 `file-management-history-panel.tsx`，父工作区保留扫描、AI 请求、任务状态、错误/成功播报和全部 Preload 调用，历史组件承载计划/执行记录、键盘、分页和确认面板。
- 先新增 3 项文件管理历史职责/调用特征测试，再移动实现；锁定历史区 End/Enter 键盘定位、计划归档/重新草拟和执行记录回滚/删除确认。
- `npm run check`：35 个 Vitest 文件/223 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 2.6 分钟。
- Playwright 重新生成并人工复核文件计划历史确认态的 1440×900、1280×720 亮暗截图；历史区 DOM/class、内部滚动、键盘定位、确认焦点、主题和主操作无视觉变化。扫描、查询、启动和后台任务路径未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖；全新 userData、已有 V2 userData、旧 schema 原位升级、文件执行/回滚和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第七切片实测（2026-07-21）

- 基线：`91f7090 docs: hand off session f file history split`；特征测试提交：`a28bf3c test: characterize file plan review`；代码提交：`e403e44 refactor: split file plan review panel`。
- `file-management-workspace.tsx` 从 861 行降至 654 行；新增 269 行的 `file-management-plan-review-panel.tsx`。父工作区保留 AI 预览/生成/取消、全部 Preload 调用、计划执行、任务状态、错误/成功播报和刷新，审查组件承载分组/Diff、勾选、空状态、取消/诊断按钮及执行二次确认。
- 先新增 3 项文件计划审查职责/调用特征测试，再移动实现；锁定分组/Diff/独立勾选、零操作与无计划空状态、取消/诊断调用、确认焦点回归和精确 `operationIds`。
- `npm run check`：35 个 Vitest 文件/226 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：最终单次完整运行 54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 3.3 分钟。沙箱内 Electron/本地端口 `EPERM` 不属于应用失败；授权后首次完整运行遇到一次既有模板弹窗 X 命中时序波动，定向 9 项和随后完整 54 项均通过。
- Playwright 重新生成并人工复核 `stage5-file-plan-light.png`、`stage5-file-plan-light-1280x720.png` 和 `stage5-file-plan-dark.png`；计划分组、Diff、复选框、侧栏、滚动、焦点、主题和主操作无视觉变化。扫描、查询、启动和后台任务路径未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token、依赖或 ADR；全新 userData、已有 V2 userData、旧 schema 原位升级、文件执行/回滚和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第八切片实测（2026-07-21）

- 基线：`7ca17b0 docs: hand off session f file plan review split`；特征测试提交：`fecfdfc test: characterize file management audit`；代码提交：`a0254a9 refactor: split file management audit panel`。
- `file-management-workspace.tsx` 从 654 行降至 573 行；新增 99 行的 `file-management-audit-panel.tsx`。父工作区保留审计启动/轮询/取消、任务状态、播报和全部 Preload 调用，审计组件承载进度、结果时间、截断、问题列表、40 条边界和无问题空状态。
- 先新增 3 项只读审计职责/调用特征测试，再移动实现；锁定进行中计数与取消任务参数、问题分类/路径/确定性说明，以及空结果、截断提示、下一步和第 40/41 条边界。
- `npm run check`：35 个 Vitest 文件/229 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 3.1 分钟。
- Playwright 重新生成并人工复核 `stage5-file-plan-light.png`、`stage5-file-plan-light-1280x720.png` 和 `stage5-file-plan-dark.png`；审计标题/计数、问题分类、内部滚动、侧栏排列、主题和主操作无视觉变化。扫描、查询、启动和后台任务实现未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务种类/协议、备份格式、Provider 协议、安全上限、布局偏好、视觉 token、依赖或 ADR；全新 userData、已有 V2 userData、旧 schema 原位升级、审计取消、文件执行/回滚和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第九切片实测（2026-07-21）

- 基线：`d942ce4 docs: hand off session f file management audit split`；特征测试提交：`361a7b6 test: characterize data backup restore workspace`；代码提交：`85064b6 refactor: split data backup restore panel`；文档交接提交见本文所在提交。
- `data-management-workspace.tsx` 从 1,164 行降至 1,029 行；新增 194 行 `data-backup-restore-panel.tsx`。父工作区继续承载生命周期/中断恢复/隔离流程、全部 `dataManagement` Preload 调用、诊断刷新、恢复确认焦点引用、状态播报和页面组合；新组件只接收受控数据与回调。
- 先新增 3 项特征测试，再移动实现：锁定导出源码范围与 manifest 展示、独立校验调用、恢复预览焦点/显式确认/精确恢复参数及 Provider 密钥重填播报。实现提交前定向 3 项通过，typecheck、ESLint 0 warnings、Prettier 通过。
- `npm run check`：36 个 Vitest 文件/232 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：授权 GUI/本地 mock 端口后 54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 条件跳过，总耗时约 2.7 分钟。首次沙箱尝试的 Electron/端口 `EPERM` 是环境限制，非应用失败。
- Playwright 真实数据管理导出/恢复流程通过；本切片没有视觉意图，复用并人工复核 `output/playwright/session-d-final/` 中 1440×900、1280×720、1024×640 和 200% 亮暗数据管理矩阵，未改变 DOM/class、滚动、焦点、live region 或视觉 token。
- 没有改变 SQLite schema、migration、IPC/Zod、备份格式、Provider 协议、后台任务、安全上限、依赖或权限；全新 userData、已有 V2 userData、旧 schema migration、恢复前备份、故障回滚和中断恢复由现有 E2E 继续覆盖。
- 扫描、查询、索引、分页、启动和后台任务路径未改变，未重跑 `PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance`；最近性能证据仍为 `output/performance/session-e-session-f-template-service-split-final.md`。Session F 仍未重新打包。
- 外部限制不变：当前 `security find-identity -v -p codesigning` 为 `0 valid identities found`，主机为 macOS arm64，没有真实 Windows 安装环境；正式签名/notarization、Windows Authenticode/安装验收、VoiceOver 长流程和 Windows Narrator/高对比实机检查仍未完成。
