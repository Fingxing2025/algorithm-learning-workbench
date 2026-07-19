# V2 实施顺序

## 阶段 0：工程与视觉基线（已完成，2026-07-14）

- 初始化 Electron + React + TypeScript + Vite。
- 固定 main/preload/renderer 边界和安全窗口配置。
- 建立 ESLint、格式、Vitest、Playwright 和 CI 骨架。
- 建立设计 token、亮暗主题、字体、图标和基础组件展示页。
- 验证全新应用数据目录可以自动初始化，不依赖旧项目或预置个人数据。

验收：桌面应用可启动；Renderer 无 Node 权限；核心组件有双主题截图。

完成证据：`npm run check` 与 `npm run test:e2e` 通过；Playwright 已生成 1440×900 亮暗主题及 1280×720 高分屏截图。

## 阶段 1：模板库纵向切片（已完成，2026-07-14）

- 实现首次启动引导：创建空白模板工作区或选择已有目录。
- 只读扫描用户选择的已有模板目录，空目录也必须可正常使用。
- 建立 Template 索引和“真实路径/展示路径”双模型。
- 实现模板树、全局搜索、算法卡片和源码查看。
- 对已有目录生成扫描摘要，不执行自动整理或迁移写入。

验收：新用户能创建空白工作区并添加第一个模板；已有目录的模板数量可核对；目录折叠不改动磁盘；搜索可以定位树节点。

完成证据：11 项 Vitest 覆盖契约、路径守卫、只读扫描、树折叠和 Renderer；4 项真实 Electron E2E 覆盖全新启动、目录授权、SQLite 索引、首个模板、不覆盖、键盘搜索、源码读取与复制。Playwright 已生成首次引导、1440×900 亮暗主题和 1280×720 截图。

## 阶段 2：题目与关联（已完成，2026-07-14）

- 建立 Problem 和 TemplateProblemRelation schema/migration。
- 实现题目列表、题目卡片以及双向关联编辑。
- 支持题目图片的本地保存和清理策略。

验收：同一题可关联多个模板；删除关系不删除模板或题目；应用重启后数据保持。

完成证据：14 项 Vitest 覆盖契约、Renderer 和既有文件安全边界；8 项真实 Electron E2E 覆盖题目创建、双模板关联、解除关系、图片保存与补偿式清理、模板重扫、双向查看、应用重启持久化，以及阶段 1 数据库原位升级。Playwright 已生成 1440×900 亮暗主题和 1280×720 题目工作区截图。

## 阶段 3：AI Provider 平台（已完成，2026-07-14）

- 实现 Provider Adapter、能力声明、连接测试和任务路由。
- 接入安全密钥存储。
- 实现 OpenAI-compatible Chat Completions、OpenAI Responses、Anthropic Messages、Gemini GenerateContent 和 Ollama Chat 协议边界。
- 统一流式/结构化能力声明和错误分类，为后续任务调用保留类型边界。

验收：至少两个不同协议的 Provider 可配置；错误提示可区分鉴权、模型、网络和能力问题；日志无密钥。

完成证据：18 项 Vitest 覆盖 Adapter 请求契约、错误分类、密钥文件加密/删除和既有模块；11 项真实 Electron E2E 覆盖 OpenAI Chat Completions 与 Anthropic Messages 两种协议、本地 mock 连接测试、404 模型错误、SQLite/密钥文件明文检查、桌面重启后解密、阶段 0–2 回归和阶段 1 数据库增量升级。Playwright 已生成 1440×900、1280×720 和深色 Provider 工作区截图；`npm audit` 报告 0 个漏洞。

## 阶段 4：题目 AI 分析（已完成，2026-07-14）

- 接入文本和图片分析。
- 将结果映射为可编辑题目草稿和候选模板关联。
- 用户确认后才写数据库。

验收：取消草稿不产生数据；确认后题目和关联可双向查看；不生成学习诊断。

完成证据：23 项 Vitest 覆盖分析契约、图片魔数复检、批次限制、多协议请求和既有模块；14 项真实 Electron E2E 覆盖视觉任务路由、题面与图片请求、AI JSON 草稿、候选模板过滤、取消零写入、确认后的图片/AI 关联事务写入、桌面重启持久化，以及阶段 0–3 全量回归。Playwright 已生成 1440×900、1280×720 和深色题目草稿截图。

## 阶段 5：入库与总体文件 AI 管理（已完成，2026-07-14）

- 重做模板入库流程。
- 实现全库扫描、AI 整理计划、Diff、选择性确认、备份与回滚。
- 增加操作记录和冲突处理。

验收：AI 默认不修改文件；取消计划后磁盘不变；部分失败可恢复。

完成证据：25 项 Vitest 覆盖路径规范化、元数据和既有模块；19 项真实 Electron E2E 覆盖源码上传、AI 分类预览、嵌套路径入库、元数据编辑与重启持久化、确定性全库审计、AI 计划过滤、取消零修改、选择性执行、备份、路径 ID 变化后的题目关系迁移、撤销恢复，以及阶段 0–4 回归。Playwright 已生成 1440×900、1280×720 和深色文件计划截图。

## 阶段 6：打包与发布质量（已完成，2026-07-14）

- 使用全新用户数据目录验证首次启动、空白工作区和默认配置。
- 验证版本化数据库 migration 能保护 V2 自身升级后的用户数据。
- 完成 macOS/Windows 打包验证。
- 完成安全威胁模型、核心 E2E、视觉回归和性能检查。
- 再决定自动更新、代码签名和发布渠道。

验收：全新 userData 的真实打包入口可启动；DMG 结构与校验有效；安装包不包含个人数据库或密钥；依赖审计和完整质量门禁通过；未完成的签名与平台实机限制有明确披露。

完成证据：25 项 Vitest 与 19 项真实 Electron E2E 全部通过，另有 1 项打包后二进制 smoke test 通过；`npm audit --audit-level=moderate` 报告 0 个漏洞。macOS arm64 DMG/ZIP 由 electron-builder 26.15.3 成功生成，`hdiutil verify` 有效；亮色、深色和 1280×720 核心截图已人工复核。Renderer 生产主包为 547.85 kB，真实打包入口在测试环境约 2.9 秒完成首次窗口验证。Windows NSIS 只有 CI 构建配置，尚未在真实 Windows 主机验收；macOS 产物为 ad-hoc 签名且未 notarize，因此只作为开发预览。

## 0.1.2 首轮质量迭代（已完成，2026-07-15）

- 题目图片支持大图预览和 Escape 关闭。
- 题目支持事务式删除；模板支持备份后删除并复用文件计划撤销能力。
- 模板元数据补全改为语言一致的 3–4 级精细分类，本地生成安全路径和文件名。
- 工作区审计新增规范化相同与高相似源码分组，每组只建议保留一个。
- 已取消或已回滚的文件计划可重新校验并复制为全新草稿。
- 视觉系统升级为紫蓝、青绿、琥珀、珊瑚四色语义体系；玻璃集中在导航与浮层，内容区增加环境光、焦点卡和支持减少动效的微交互。

当前累计基线：187 项 Vitest、3 项发布脚本测试与 43 项常规真实 Electron E2E 通过；打包入口全新/已有 V2 userData smoke 2 项独立通过。上述各阶段中的测试数字是阶段完成时的历史快照，不代表当前累计数量。

## Session C：发布候选工程（自动化已完成，2026-07-18）

- 新增 ADR-0018，严格区分 unsigned/ad-hoc preview、signed/notarized、Windows CI 构建和 Windows 实机安装证据。
- 建立从 `package.json` 精确推导当前版本制品的一键候选流程；生成 SHA-256、CycloneDX SBOM、构建元数据、验证报告和发布说明草稿。
- 自动验证 Info.plist、App/`better_sqlite3.node` 架构、DMG、1024×1024 alpha 图标、签名/公证真实状态和包内容隐私边界。
- macOS 使用最小 hardened-runtime entitlement；preview 主动清除签名环境，signed 缺身份/凭据或最终证据时失败关闭。
- CI Actions 固定到 commit SHA，macOS arm64 与 Windows x64 原生 runner 各构建候选并运行两项打包入口 smoke。
- 提供 Windows 实机验收脚本，覆盖摘要、Authenticode、NSIS 安装、全新/已有 V2 userData 启动、快捷方式、卸载和数据保留。

验收：最终 macOS arm64 preview 候选来自干净提交，DMG/ZIP 摘要复核、SBOM、架构/图标/隐私检查和两项打包入口 smoke 通过；signed 预检在机器没有 Developer ID 时按设计失败。macOS 正式签名/notarization 与 Windows 实机仍等待外部凭据和硬件，不得标记为完成。

## Session E：大型工作区性能（已完成，2026-07-19）

- 建立单命令 `npm run benchmark:performance`，用临时工作区生成确定性 1k/5k/10k 模板、题目、图片元数据和关系夹具，记录 5 次运行的 P50/P95、RSS、冷热条件和取消耗时。
- 新增 migration `0006_performance_indexing.sql` 与索引版本 `1`；使用纳秒级变化令牌和完整 SHA-256，在安全复检后单事务差量发布。
- 完成唯一移动匹配、删除标记不可用、扫描中途变化整次拒绝，以及取消不发布半完成索引。
- 扫描和源码审计进入 Main 进程内后台任务；Renderer 显示阶段/计数、不确定进度和取消入口。
- 模板、题目、模板关联、文件计划和执行历史使用稳定键集分页；题目大列表虚拟化，小工作区继续使用原生列表 DOM。
- 重复/相似审计复用持久化哈希/签名；AI 上下文切换为批量元数据与关系聚合查询。

验收：`npm run check` 通过 201 项 Vitest 与 3 项发布脚本测试；完整 Electron E2E 覆盖 54 项常规场景，2 项 packaged 按条件跳过。10k 无变化重扫 `hashed = 0`、`reused = unchanged = 10,000`；题目首批查询 P50 3.09 ms、详情 0.18 ms、审计 78.81 ms、AI 候选 135.84 ms、取消 0.27 ms。详细结果见 `docs/PERFORMANCE_BASELINE.md` 和 `docs/SESSION_E_SUMMARY_AND_NEXT_PROMPT.md`。

## Session F：代码健康与文档发布候选（第四切片已完成，2026-07-19）

- `App.tsx` 从约 1,630 行降至约 292 行，只保留应用状态协调、领域动作与组合。
- 应用导航/快捷键、路由判定、应用外壳/布局状态、对话框状态、工作区路由、Dashboard、模板库和不可用工作区各自形成语义边界。
- `template-management-service.ts` 的审计、AI 文件计划、计划安全校验、执行/回滚和计划历史职责拆到五个 Main 服务文件，原公开 façade、IPC 和调用图保持不变。
- 新增审计重复/取消特征测试；共享常量、语言规则和路径/元数据小工具只承载跨职责的稳定逻辑。
- `ai-provider-workspace.tsx` 从 745 行降至 246 行；页面容器、编辑表单/任务路由、Provider 列表和纯表单转换分别形成语义文件，既有 `use-ai-providers.ts` 保持唯一 Preload 调用边界。
- AI Provider 拆分前新增 3 项组件特征测试，锁定密钥保留、请求构造、任务路由、预设创建和无效请求头阻断；没有改变五类协议、能力检查或密钥存储语义。
- `problem-analysis-dialog.tsx` 从 969 行降至 826 行；模板关联草稿编辑器移入 `problem-analysis-relations.tsx`，通过受控 props/回调保持关联勾选、关系类型、备注和搜索行为。
- 新增 3 项题目分析组件特征测试，锁定标签去重/关系筛选、AI 预览与草稿合并、忙碌关闭取消；Preload 调用仍只在原对话框内。
- 新增快捷键与路由纯逻辑测试；完整桌面回归证明布局、焦点、键盘、增量索引、分页、取消和数据恢复行为不变。
- 本阶段没有数据库字段、migration、IPC、后台任务协议、系统权限、依赖或视觉系统变化，也未重新打包。

验收：第四切片 `npm run check` 通过 33 个 Vitest 文件/217 项与 3 项发布脚本测试；完整 Electron E2E 为 54 项通过、2 项 packaged 按条件跳过。题目分析 1440×900 亮色/深色与 1280×720 紧凑截图已重新生成并人工复核，关联编辑器布局、滚动、焦点和主题无视觉变化。扫描、查询、启动和后台任务路径未改变，因此未重跑性能基准；Session F 第二切片的正式 1k/5k/10k 报告仍是最近性能证据。第四切片仍没有 schema、IPC、协议或视觉重做。

## 后续阶段

核心功能范围已经闭环，后续不再以继续增加页面为主。优先顺序改为：

1. 外部条件齐备时完成 macOS 签名/notarization、Windows Authenticode 与真实主机安装验收。
2. 继续行为保持地拆分文件管理、题目或数据管理等大型 Renderer 页面并补领域单测；`App.tsx`、模板管理服务和 AI Provider 工作区切片已完成。
3. 统一 README、用户指南、CHANGELOG、架构与发布事实来源。
4. 在真实 Windows 主机验证 Session E 的大工作区滚动、取消和原位升级；macOS arm64 结果不能替代该证据。

详细任务边界、验收条件和不同 Codex Session 的启动提示见 `docs/PROJECT_STATUS_AND_HANDOFF.md`。
