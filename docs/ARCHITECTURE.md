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

安全与发布文档：

- `docs/智能算法学习助手-v2-threat-model.md`
- `docs/SECURITY_REVIEW.md`
- `docs/RELEASE.md`
- `docs/USER_GUIDE.md`
