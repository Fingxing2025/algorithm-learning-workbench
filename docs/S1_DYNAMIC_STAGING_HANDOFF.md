# S1：动态暂存独立切片交接

## 范围与来源

基于 `0d9789f21875ee00a224c2a0d46502ad33ce52ef`，分支
`codex/s1-dynamic-staging-integration`。以 c43d 的动态暂存业务源码为只读来源，
34 个源文件移植前后的 SHA256 相同（见 `S1_DYNAMIC_STAGING_SOURCE_MANIFEST.json`）。未导入来源发布脚本、package.json、Codex 配置
或旧项目个人数据；未修改 c43d，也未 push 或合并长期分支。

需求对应：批量模板入库、逐项动态目录上下文、进度、失败续跑、人工审查、最终确认，
以及重启恢复和用户数据保护。S3 分类体系与 S4 持久化工作区锁不属于本切片。

## 行为与数据契约

- 真实“新建模板 → 批量导入 C++”入口创建 `.awb/staging/<id>/`；外部源码只读，
  工作区新副本为 UTF-8。后一个 AI 请求能看到此前已持久化的暂存目录。
- 无 AI 时显示未分类；AI 结果显示分类待确认。关闭弹窗取消当前请求并保留批次，
  重启可恢复；迟到成功响应不能计为完成。继续/重试保留已有完成项。
- 手工路径编辑、排除项及暂存内 AI 整理更新文件、清单和 SQLite。整组 AI 操作
  先备份，后续失败则整组回滚。AI 文件计划只允许当前批可操作 ID。
- 应用前复检工作区/暂存树、源码哈希及元数据上下文版本。目录交换后，索引、
  元数据和 applied 会话状态在一个 SQLite 事务内提交，原模板 ID 与题目关联保留。
- “备份与恢复”只读发现中断记录；勾选确认后，未提交事务退回原树，已提交事务
  核验新树后收尾。自动恢复失败或外部篡改时保留证据，不覆盖未知数据。
- 未完成暂存或中断应用存在时，阻止便携备份导出/恢复，避免静默遗漏暂存源码。
- 移除“背包问题 → 01背包”的硬编码默认动作；目录线索不能决定具体背包子类型。

`0009_batch_template_staging.sql` 仅新增 sessions/items 两表与索引、外键和状态约束。
原模板、题目、关联表不改 schema。所有新能力经 Zod 校验的命名 IPC 和最小 Preload API，
Renderer 不访问文件系统/数据库。`WorkspaceService.rescanCurrentWorkspace` 增加可选事务
发布回调；已有调用保持不变。无新增依赖、Provider 协议或密钥存储格式。

## 主要修改入口

- `src/main/services/batch-template-staging-service.ts`：暂存生命周期、文件和恢复 journal。
- `src/main/services/template-staging-audit-service.ts`：只读审查、AI 草稿、批次白名单。
- `src/main/database/batch-template-staging-repository.ts`：乐观版本、状态转换及事务。
- `src/core/contracts/template-management.ts`、IPC、Preload 和 Main 装配：桌面契约。
- `src/renderer/src/features/templates/batch-template-import-dialog.tsx`：逐项暂存工作流。
- `src/renderer/src/features/data/batch-staging-recovery-panel.tsx`：显式恢复确认入口。
- `src/main/services/data-management-service.ts`：备份/恢复与未完成暂存的边界。
- `src/main/security/`：路径、大小写冲突、Windows drive-relative 与 symlink 防护。

## 验证记录

独立执行 `npm ci --no-audit --no-fund`；未链接其他任务的 node_modules。
Node 单元测试前执行 `npm rebuild better-sqlite3`；Electron 验证前执行
`npm run rebuild:native && npm run build`。两种 ABI 不可并行切换。
Electron 命令：`node node_modules/@playwright/test/cli.js test tests/e2e/batch-staging.spec.ts tests/e2e/template-intake.spec.ts`。
测试跨任务使用 `/tmp/awb-template-org-e2e.lock` 互斥目录，结束释放。

- TypeScript：通过。
- ESLint / Prettier：通过（SQL 使用原有 migration 格式，无 SQL formatter）。
- Vitest：56 文件 / 431 测试全部通过。
- 发布脚本：9 / 9 通过；没有执行发布或安装包签名。
- 迁移测试：从已有 V2 表与工作区记录升级，保留记录，外键正常；空库初始化通过。
- 服务边界：取消后的迟到响应、失败重试、清单写入失败、整组审查回滚、提交前回滚、
  提交后 journal 失败、备份准备中断、外来文件和大小写冲突均有回归。
- Electron：`batch-staging.spec.ts` 4 / 4、`template-intake.spec.ts` 8 / 8 通过。
  前者含桌面选择源码、逐项动态上下文、重启续跑、备份阻断与最终确认，以及
  after-main-move / after-file-swap / after-database-commit 三个真实 process.exit 恢复点。
  后者覆盖单模板、语言切换、字段冲突、手动暂存冲突、扫描目录、AI 元数据及既有模板补全。
  更新旧测试时修正了继续准备步骤和 mock 将参考源码误当当前源码的问题。
- 12 张亮暗/窗口尺寸截图均目视检查，确认操作可达；`git diff --check` 通过。

截图位于 `output/playwright/`，包含 `s1-staging-review-*` 与 `s1-recovery-*`：
亮/暗、1440×900、1280×720、1024×640。Electron 测试仅使用临时工作区、独立应用数据目录
和本地 HTTP mock，未调用用户 Provider 或访问真实题目/模板库。

## 兼容情况与后续组合

全新应用可从空白目录完成设置；没有旧项目依赖。已有 V2 数据经增量 migration 升级，
实际恢复 E2E 同时检查模板字节、用户笔记和题目关联。旧批量 IPC 保留供现有调用者使用，
新桌面入口使用暂存流程。存在未完成批次时，用户必须先应用、放弃或完成恢复再导出备份。

未覆盖 Windows/macOS Intel/Linux GUI 与安装包测试；网络验证仅覆盖本地模拟 Provider。
暂存和恢复备份会增加磁盘占用。跨进程持久化工作区互斥由 S4 补齐；本切片已有进程内
任务追踪、会话锁、版本和哈希校验。AI 草稿是内存态，重启后需重新生成审查计划；
已持久化暂存项可继续使用。

与 S3 组合时须保留其 `sourceEvidence`、`sourceCoverage`、`reviewReasons`、`proposalHistory`
等可选分类信息，并重新验证动态暂存路径、人工确认与主库分类结果一致。S3 不增加 0010
migration；后续 S4 可按集成顺序分配编号。参见 ADR-0038 与共同实施计划 ADR-0039。
