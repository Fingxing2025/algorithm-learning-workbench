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

安全与发布文档：

- `docs/智能算法学习助手-v2-threat-model.md`
- `docs/SECURITY_REVIEW.md`
- `docs/RELEASE.md`
- `docs/USER_GUIDE.md`
