# V2 架构基线

## 进程边界

```text
Renderer (React)
  -> typed preload API
Preload
  -> validated IPC
Main process
  -> application services
     -> template filesystem
     -> SQLite
     -> OS secure storage
     -> AI provider adapters
```

Renderer 只负责展示和用户交互。Main process 拥有所有系统权限；Preload 是唯一桥梁。

## 建议目录

```text
src/
  main/
    ipc/
    services/
    database/
    security/
  preload/
  renderer/
    app/
    components/
    features/
      templates/
      problems/
      ai-analysis/
      file-manager/
      settings/
    design-system/
  core/
    domain/
    providers/
    validation/
tests/
  unit/
  integration/
  e2e/
```

## 核心实体

- `TemplateWorkspace`：用户创建或授权选择的模板根目录及展示设置。
- `Template`：模板索引和可编辑元数据；源码以文件为准。
- `Problem`：题目卡片、题面、图片引用和用户备注。
- `TemplateProblemRelation`：模板与题目的多对多关系。
- `AiProviderProfile`：不含明文密钥的供应商配置。
- `AiTaskRoute`：不同任务到 Provider/模型的映射。
- `FileChangePlan`：AI 提议的可预览、可确认文件操作。

## 数据策略

- 首次启动在应用数据目录创建全新的 SQLite 数据库，不读取或依赖旧项目数据。
- SQLite 保存索引、卡片、关系、配置和操作记录。
- 模板源码保留在用户选择的文件夹，数据库不成为唯一副本。
- 题目图片存放于应用数据目录，由数据库记录相对路径和校验信息。
- API Key 由 Electron `safeStorage` 使用操作系统提供的安全能力加密，密文独立存放在应用数据目录；SQLite 只保存不可逆推出密钥的文件引用。
- schema 通过版本化 migration 演进。
- 不提供旧版数据格式兼容层或旧项目导入器；schema migration 只负责保护 V2 自身版本升级后的用户数据。

## 关键架构决策

- 使用 Electron 是为了统一 Chromium 渲染、成熟的本地 Node 生态和较低的多供应商接入成本。
- 使用 React/TypeScript 是为了支撑复杂工作台 UI、跨模块状态和可测试组件。
- 模板树使用“真实路径 + 展示路径”双模型，避免 UI 优化破坏用户文件。
- AI 文件管理使用计划/预览/确认三阶段，不允许模型直接修改工作区。
- V2 采用独立首次启动流程，不以旧项目目录、模板或数据库作为运行前提。

重大变更应在本文件追加决策记录，包括背景、备选方案、决定和后果。

当前决策记录：

- `docs/decisions/0001-stage-0-foundation.md`
- `docs/decisions/0002-template-workspace-and-scan.md`
- `docs/decisions/0003-problems-relations-and-images.md`
- `docs/decisions/0004-ai-provider-platform.md`
- `docs/decisions/0005-problem-ai-analysis-drafts.md`
- `docs/decisions/0006-template-intake-and-file-plans.md`
- `docs/decisions/0007-release-security-and-backup-retention.md`
- `docs/decisions/0008-workspace-navigation-code-viewer-and-ai-plan-recovery.md`
- `docs/decisions/0009-template-metadata-merge-review.md`
- `docs/decisions/0010-deletion-classification-and-plan-redrafting.md`
- `docs/decisions/0011-interface-localization-and-dashboard-motion.md`
- `docs/decisions/0012-workspace-ai-context-and-problem-structure.md`
- `docs/decisions/0013-workspace-file-ai-plan-v2.md`
- `docs/decisions/0014-batch-cpp-template-intake.md`
- `docs/decisions/0015-data-backup-diagnostics-and-restore.md`
- `docs/decisions/0016-ai-task-reliability-and-provider-compatibility.md`
- `docs/decisions/0017-bugfix-workflows-and-local-template-retrieval.md`
- `docs/decisions/0018-release-candidate-pipeline-and-platform-evidence.md`
- `docs/decisions/0019-long-image-preview-and-execution-record-deletion.md`
- `docs/decisions/0020-incremental-index-background-tasks-and-keyset-pagination.md`
- `docs/decisions/0021-safe-source-editing-and-permanent-file-history-deletion.md`
- `docs/decisions/0022-complete-workspace-ai-template-catalog.md`

## Session E 大型工作区架构

### 版本化模板索引

- SQLite `templates` 保存 `content_hash`、`file_identity`、纳秒级 `change_token`、`normalized_content_hash`、`similarity_signature_json` 和 `index_version`；当前索引版本为 `1`。
- 快速复用由受控相对路径、大小、文件身份及 `mtimeNs/ctimeNs` 变化令牌共同决定；内容真实性仍由完整 SHA-256 保证，不能只依赖 mtime。
- 扫描读取前后复检文件状态；符号链接、越界、读取失败或扫描中途变化会安全拒绝整次发布。完整候选形成后才在单个 SQLite 事务中差量发布。
- 应用外移动只在文件身份唯一，或“内容 SHA-256 + 大小”双方唯一时继承稳定 ID；歧义时不猜测。旧记录标记不可用，元数据和题目关系不会被静默迁错。

### 后台任务与原子发布

- `BackgroundTaskRegistry` 位于 Main，首批承载 `workspace-scan` 与 `workspace-audit`。任务状态和取消控制只驻留进程内，不写数据库、不跨重启恢复。
- Renderer 只通过命名 Preload API 启动、轮询和取消任务；所有输入输出经过 Zod。取消会立即解除 Renderer 忙碌，并阻止后续批次与最终索引发布。
- 同工作区同类型活动任务复用，不并发写索引；应用退出时先取消并等待任务终止，再关闭 SQLite。

### 大列表查询边界

- 工作区快照只携带按 `(relative_path ASC, id ASC)` 排序的前 500 份模板及分页摘要；后续模板、全局模板搜索和直接定位由 Main 键集查询完成。
- 题目按 `(updated_at DESC, id DESC)` 分页，首批 100；单题详情按 UUID 直查。模板关联只返回最小题目摘要分页，不装配全量题面、图片和关系。
- 文件计划与执行历史按 `(created_at DESC, id DESC)` 分页。所有仍存在的上限返回 `processedCount`、`totalCount`、`truncatedReason` 与 `nextAction`。
- 题目列表超过 100 条时使用 TanStack 虚拟化；小工作区保留原生 DOM/滚动条行为。模板树继续虚拟化并保持 Arrow、Home/End、Enter/Space 和搜索定位契约。

### AI 与审计查询

- 完全重复使用持久化规范化 SHA-256；高相似审计先用签名 band 生成候选，再只对候选读取源码并执行精确 Jaccard。
- AI 上下文用批量元数据查询和按模板聚合的题目关系 SQL，避免全量装配题目正文和逐模板 N+1 查询。
- Provider 字符上限、隐私预览和文件计划安全 Schema 不变；本地性能优化没有扩大外发内容边界。

## Session F Renderer 组合边界

Session F 第一切片只做行为保持的 Renderer 拆分，不新增进程权限、IPC 或持久化协议：

- `src/renderer/src/App.tsx` 只负责应用级状态协调、领域动作和最终组合；不直接承载大型页面 JSX。
- `src/renderer/src/app/app-navigation.ts` 固定 `AppView`、页面播报标签、全局快捷键解析和编辑控件避让规则；快捷键行为通过纯函数测试锁定。
- `src/renderer/src/app/app-route.ts` 只负责加载中、引导、工作区不可用和领域页面之间的确定性优先级。
- `src/renderer/src/app/app-shell.tsx` 负责窗口标题栏、导航、布局偏好、主题/语言入口、状态播报和壳层通知；`ResizableLayout` 与 `localStorage` 布局契约不变。
- `src/renderer/src/app/app-dialogs.tsx` 与 `use-app-dialogs.ts` 负责命令面板/新建模板对话框的受控状态和触发器焦点引用。
- `src/renderer/src/app/app-workspace-route.tsx` 负责按路由渲染工作区页面、加载态和首次设置态；模板库、题目、AI 和数据管理仍复用原有组件与命名 Preload API。
- Dashboard、模板库和工作区不可用状态移动到各自语义文件；没有复制旧项目代码，也没有改变视觉 token、产品模块或数据流。

### Session F Main 模板管理服务边界

Session F 第二切片在保持 `TemplateManagementService` 构造参数、公开方法、IPC 和数据契约不变的前提下，拆出五个有明确领域语义的 Main 协作者。Facade 仍是 IPC 唯一入口；协作者不被 Renderer 或 Preload 直接引用。

- `template-workspace-audit-service.ts`：工作区索引审计、规范化重复组、高相似候选、进度回调、取消和安全截断。
- `template-file-plan-generation-service.ts`：AI 文件计划上下文候选、请求预览、结构化输出、语言校验、有限取消和诊断导出。
- `template-file-plan-safety.ts`：授权路径、目标冲突、源码/元数据前置条件和执行前外部修改复检。
- `template-file-plan-executor.ts`：文件计划执行、备份、工作区重扫、补偿回滚、模板删除和执行撤销。
- `template-file-plan-history-service.ts`：计划取消/重新草拟、归档、分页历史、执行记录删除和工作区归属校验。

模板入库、批量导入、元数据分类和手动移动的 IPC façade 行为继续由 `template-management-service.ts` 组合；手动移动复用同一安全校验与执行器。拆分没有新增数据库字段、migration、IPC 名称、后台任务种类、文件备份格式、Provider 协议或权限。

### Session F AI Provider Renderer 边界

Session F 第三切片在保持 App 路由、`ResizableLayout`、布局偏好、Provider 协议/能力、密钥语义和命名 Preload API 不变的前提下，把 AI Provider 工作区拆为四个 Renderer 职责：

- `ai-provider-workspace.tsx`：页面状态协调、选中/新建切换、创建/更新/删除/连接测试/任务路由动作组合和最终布局装配。
- `ai-provider-editor.tsx`：Provider 预设、连接表单、能力声明、任务路由、状态反馈和删除确认的完整展示边界。
- `ai-provider-list.tsx`：Provider 空状态、列表项、选中样式和选择回调。
- `ai-provider-form.ts`：协议选项、表单默认值、Profile 到表单转换、协议标签和自定义请求头解析等纯逻辑。
- `use-ai-providers.ts` 保持未修改，是上述组件唯一的命名 Preload 调用层；新拆出的展示/纯逻辑文件不访问 `window.desktop`、Node、SQLite、文件系统或密钥存储。

拆分前先用组件特征测试锁定更新时空 API Key 不清空已有密钥、请求头/超时请求构造、任务路由、预设创建和无效请求头阻断。该切片没有新增 ADR，因为没有改变进程边界、持久化协议、IPC/Zod 契约、Provider Adapter、安全上限或视觉系统。

### Session F 题目分析 Renderer 边界

Session F 第四切片继续保持行为不变，只把题目分析对话框中的模板关联草稿编辑器移到独立 Renderer 组件。`ProblemAnalysisDialog` 仍是题目分析状态、AI 预览/取消/分析/提交动作和 Radix 对话框生命周期的唯一协调者；新增组件不访问 Preload、Node、SQLite、文件系统或密钥。

- `problem-analysis-relations.tsx`：模板搜索输入、手动模板选择、候选勾选、关系类型/备注编辑、候选移除和关联草稿空状态；通过受控 props 与回调接收数据。
- `problem-analysis-dialog.tsx`：保留题目字段、图片、AI 请求、草稿合并、取消、原子提交、焦点恢复、布局和预览浮层；`window.desktop.problemAnalysis` 调用图不变。
- `problem-analysis-dialog.test.tsx`：用组件特征测试锁定预览→分析→只补空字段→原子提交、标签去重/关系筛选，以及忙碌关闭先取消活动请求。

该切片没有新增数据库字段、migration、IPC/Zod 契约、后台任务、备份格式、Provider 协议、安全上限或视觉 token；原关联区域的 DOM 结构、class、键盘控件和状态播报保持不变。

### Session F 题目工作区详情边界

Session F 第五切片继续保持 `ProblemWorkspace` 的左侧列表、搜索、键盘导航、虚拟滚动和 `ResizableLayout` 不变，把选中题目的右侧详情面板移到独立 Renderer 组件。父工作区仍负责列表状态、题目选择、分页、对话框装配和领域回调；详情组件不访问 Preload、Node、SQLite、文件系统或密钥。

- `problem-details-panel.tsx`：题目头部、题面/摘要/备注、结构化分析、模板关联、图片卡片，以及删除/解除关联确认和详情操作回调。
- `problem-workspace.tsx`：保留题目列表、筛选/分页、键盘行为、布局分隔条、空状态和编辑/关联/AI 对话框装配。
- `problem-workspace.test.tsx`：锁定可用模板打开、解除关联二次确认、添加图片和删除二次确认的调用特征。

详情面板继续使用原 `section[role=region]`、滚动边界、class、accessible name 和操作标签；本切片没有新增数据库字段、migration、IPC/Zod 契约、后台任务、备份格式、Provider 协议、安全上限或视觉 token。

### Session F 文件管理历史 Renderer 边界

Session F 第六切片继续保持总体文件 AI 管理的计划生成、执行、回滚和错误状态不变，把右侧“计划记录与撤销”历史面板移到独立 Renderer 组件。父工作区仍负责所有命名 Preload 调用、后台任务状态、错误/成功播报、领域动作和数据刷新；历史组件不访问 Preload、Node、SQLite、文件系统或密钥。

- `file-management-history-panel.tsx`：计划历史、执行记录、分页按钮、键盘滚动与 Enter/Space 定位、归档/删除/回滚确认面板，以及受控操作回调。
- `file-management-workspace.tsx`：保留工作区扫描、AI 请求预览/生成/取消、待确认计划、执行/回滚/归档动作、错误状态和最终布局组合。
- `file-management-workspace.test.tsx`：锁定历史区域键盘契约、计划归档/重新草拟和执行记录回滚/删除确认的调用特征。

历史面板继续使用原 `section` 层级、`aria-label="文件计划历史列表"`、滚动边界、class、按钮标签和焦点引用；本切片没有新增数据库字段、migration、IPC/Zod 契约、后台任务、备份格式、Provider 协议、安全上限或视觉 token。

### Session F 文件管理计划审查 Renderer 边界

Session F 第七切片继续保持总体文件 AI 管理的请求预览、计划生成、文件执行和状态播报不变，把左侧“待确认变更计划”审查区移到独立 Renderer 组件。父工作区仍是所有命名 Preload 调用、AI 生成/取消、计划取消/诊断/执行、后台任务状态、错误/成功播报和数据刷新的唯一协调者；计划审查组件不访问 Preload、Node、SQLite、文件系统或密钥。

- `file-management-plan-review-panel.tsx`：操作分组、移动/删除/元数据 Diff、勾选状态、无计划/零操作空状态、取消/诊断按钮和执行二次确认，以及确认按钮/触发器焦点回归。
- `file-management-workspace.tsx`：保留工作区扫描、AI 请求预览/生成/取消、默认勾选种子、计划取消/诊断/执行、全部 Preload 调用、任务状态、播报和最终布局组合。
- `file-management-workspace.test.tsx`：新增 3 项特征测试，锁定分组/Diff/独立勾选、两类空状态与取消/诊断调用，以及二次确认焦点和精确 `operationIds` 调用。

计划审查组件继续使用原 `section`、DOM 层级、class、按钮/复选框 accessible name、焦点顺序和视觉 token；本切片没有新增数据库字段、migration、IPC/Zod 契约、后台任务、备份格式、Provider 协议、安全上限、依赖或 ADR。

### Session F 文件管理只读审计 Renderer 边界

Session F 第八切片继续保持工作区审计的启动、轮询、取消、结果发布和状态播报不变，只把右侧“只读审计”结果展示移到独立 Renderer 组件。父工作区仍负责 `startAudit`、`backgroundTasks.get/cancel`、`waitForBackgroundTask`、任务状态、成功/错误播报和最终组合；审计组件不访问 Preload、Node、SQLite、文件系统或密钥。

- `file-management-audit-panel.tsx`：排队/运行/取消中的进度文本、结果时间、截断原因与下一步、问题分类/路径/确定性说明、40 条展示上限和无问题空状态。
- `file-management-workspace.tsx`：保留扫描按钮与取消入口、后台任务调用、审计状态发布、AI 计划流程、全部命名 Preload 调用、播报、刷新和页面组合。
- `file-management-workspace.test.tsx`：新增 3 项特征测试，锁定进行中计数与取消调用、问题分类/路径/说明，以及空结果、截断说明和 40 条展示边界。

审计组件继续使用原 `section`、DOM 层级、class、滚动边界、问题顺序、accessible text、亮暗主题和视觉 token；本切片没有新增数据库字段、migration、IPC/Zod 契约、后台任务种类/协议、备份格式、Provider 协议、安全上限、依赖或 ADR。

### Session F 数据管理备份/恢复 Renderer 边界

Session F 第九切片在保持数据管理页的生命周期、诊断和备份协议不变的前提下，把“导出与验证”区域拆为受控展示组件。父工作区继续持有所有状态、`run` 错误/成功播报、恢复确认焦点引用、诊断刷新和命名 Preload 调用；新组件不访问 `window.desktop`、Node、SQLite、文件系统或密钥。

- `data-backup-restore-panel.tsx`：导出范围勾选、导出/验证/恢复预览按钮、manifest/校验结果、恢复冲突、恢复确认焦点和恢复结果展示；通过受控 props 与回调接收数据和动作。
- `data-management-workspace.tsx`：保留生命周期/中断恢复/隔离流程、所有 `dataManagement` 调用、恢复前后诊断刷新、`userData` 恢复安全提示和最终页面组合。
- `data-management-workspace.test.tsx`：新增 3 项特征测试，锁定导出源码范围与 manifest 展示、独立校验调用、恢复预览焦点/显式确认/精确 `templateSourceStrategy: 'skip'` 请求及恢复后密钥重填播报。

拆分保持原 `section`、按钮/复选框 accessible name、确认焦点、加载禁用态、live region、亮暗主题和视觉 token；没有新增数据库字段、migration、IPC/Zod 契约、备份格式、Provider 协议、安全上限、依赖或 ADR。

### Session F 数据管理异常中断恢复 Renderer 边界

Session F 第十切片继续保持数据管理页的生命周期清单、异常恢复协议和诊断刷新不变，只把“异常中断恢复”条目与预览展示移到独立 Renderer 组件。父工作区仍负责 `previewInterruptedRecovery`、`recoverInterruptedOperation`、当前保留策略、恢复结果发布、重新诊断和状态播报；新组件不访问 `window.desktop`、Node、SQLite、文件系统或密钥。

- `data-interrupted-recovery-panel.tsx`：异常中断条目、可恢复/受保护状态、动作/原因标签、恢复预览、阻止原因、显式确认和加载态；通过受控 props 与回调接收数据和动作。
- `data-management-workspace.tsx`：保留生命周期刷新、治理/隔离流程、全部 `dataManagement` 调用、恢复结果发布、重新诊断、错误/成功播报和最终页面组合。
- `data-management-workspace.test.tsx`：新增 3 项特征测试，锁定可恢复/受保护入口、状态变化时阻止确认，以及显式确认后的精确 `confirmRecovery` / `operationId` / `retentionPolicy` 请求、诊断刷新和成功播报。

拆分保持原 DOM/class、按钮/复选框 accessible name、加载禁用态、live region、亮暗主题和视觉 token；没有新增数据库字段、migration、IPC/Zod 契约、备份/中断恢复格式、Provider 协议、安全上限、依赖或 ADR。

安全与发布文档：

- `docs/智能算法学习助手-v2-threat-model.md`
- `docs/SECURITY_REVIEW.md`
- `docs/RELEASE.md`
- `docs/USER_GUIDE.md`
