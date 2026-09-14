# S1 与 S3 组合交接

本轮完成动态暂存与源码证据分类的组合，并补齐工作区跨进程独占访问。
工作分支为 `codex/s1-dynamic-staging-integration`；只修改当前工作树，未 push、打包或发布。

## 提交组成

- `893e8fa`：持久化暂存契约、repository 与 `0009` migration。
- `a86227e`：S1 动态暂存、人工审查、事务发布、中断恢复及独立切片交接。
- `5b8ae12`：S3 `c54c1cf` 与 S1 的冲突解决，暂存分类证据和确认界面组合。
- `0b0f060`：包含 S3 `7c6ee3e` / `1178feb` 两次 C++ 词法修正；最终两个源文件与
  `1178feb` 一致，覆盖续行注释、数字分隔符和 UTF-8 字符字面量。
- 本交接所在提交：工作区所有权、恢复前禁止自动重扫及组合 Electron 回归。

S3 的 `sourceEvidence`、`sourceCoverage`、`reviewReasons` 和 `proposalHistory`
保留至暂存结果、审查和主库分类。路径修改使本次分类确认失效；恢复批次后需要重新确认。
源码引用缺失、无效或覆盖不足的 AI 整理动作默认不勾选。

## 工作区独占与恢复

`workspace-runtime-ownership.ts` 使用物理工作区根目录的
`.awb-runtime-ownership.sqlite` 独立 SQLite 连接持有 `BEGIN EXCLUSIVE`。
它在工作区创建、升级、迁移之前取得，在旧工作全部退出且业务数据库关闭后释放；
正常退出及 SIGKILL 均由操作系统释放锁，不使用 PID、TTL 或删除锁文件的抢占方式。
控制文件位于 `.awb` 外，创建失败回滚和便携恢复不会替换它；便携备份不包含该文件。
锁文件及伴随文件拒绝软链接、非普通文件和未知格式。

`WorkspaceDatabaseManager` 保留旧连接与所有权，待新连接及初始化成功后才切换。
新工作区被占用或初始化失败时旧工作区仍可用。同一物理路径重复激活复用所有权。
另一个应用实例不能通过不同 userData 同时激活、应用另一批次或写入主模板库。
启动时被占用会提示关闭另一实例的工作区。

`WorkspaceService` 在发现中断发布记录后保留原索引，等待恢复界面的显式确认，
避免 SIGKILL 后重新选目录时扫描尚未提交的文件树。详细决策见 ADR-0038。
所有权补丁不新增业务表或 migration；原 S1 的 `0009` 不变，也没有新增依赖或修改密钥格式。

## 已执行验证

独立 node_modules，Node 测试前执行 `npm rebuild better-sqlite3`，Electron 测试前执行
`npm run rebuild:native && npm run build`。本工作树使用原 lockfile，Vitest 4.1.10；
协调任务后续更新的依赖锁不在本次结果范围内。

- TypeScript、ESLint、Prettier、`git diff --check` 通过；发布脚本 9 / 9 通过。
- Vitest 全量：60 文件 / 483 测试通过。
- Electron 合计 20 项通过：暂存 5、模板入库 9、文件管理 5、空白备份及篡改检查 1。
- 暂存覆盖真实桌面入口、动态目录上下文、逐项分类确认、重启续跑、最终应用；
  after-main-move、after-file-swap、after-database-commit 三个真实进程退出恢复点。
- 新双实例场景使用不同 userData 和不同 stagingId，在文件树交换后暂停第一个实例：
  第二实例打开、应用、创建模板均被拒绝；SIGKILL 后重新取得所有权，原索引保持不变，
  显式 rollback 恢复原模板字节；再次自动启动会给出占用提示。
- 备份检查验证所有权文件未进入压缩包。
- 首轮 19 项 Electron 中 18 项通过；唯一失败是 mock 规范化后的分类路径与旧测试期望不符。
  更新 mock 和断言后，该场景单独复跑通过；随后备份检查通过。没有将失败计为通过。
- 原 S1 的 12 张暂存/恢复截图已检查；组合后重新检查 6 张暂存证据/确认截图，
  并抽查恢复小窗。亮暗主题及 1440×900、1280×720、1024×640 的底部操作可达。
  截图保存在 `output/playwright/s1-staging-review-*` 与 `s1-recovery-*`，不纳入源码提交。

## 兼容与未完成范围

全新应用和空白工作区可完成设置与导入。已有 V2 数据经增量 migration 升级；
恢复测试同时检查模板原文、用户笔记和题目关联，未访问用户真实工作区或 Provider。

本轮止于 S1/S3 组合检查点：S4 持久化分类确认及 Main 最终确认门禁尚未集成，
现有分类确认仅在当前会话保留。已确认项仍显示 S3 原始“需复核”风险徽章，
后续持久化确认接入时应统一风险提示与确认状态文案。S5 尚未对完整集成分支做最终验收。
未覆盖 Windows、Linux、macOS Intel GUI 和安装包；AI 仅用本地模拟服务验证。
GUI 互斥锁已释放，没有启动持续开发服务；测试进程均已结束。
