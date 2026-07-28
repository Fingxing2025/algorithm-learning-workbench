# ADR-0031：唯一当前工作区与备份格式

- 状态：接受
- 日期：2026-07-28
- 范围：工作区物理布局、已有文件夹升级、备份格式、AI 数据边界
- 取代：ADR-0030 中的根目录模板兼容布局，以及 ADR-0024/0026 中的旧备份读取入口

## 背景

自包含工作区已经把模板、题目、关系、图片、文件计划、执行记录和恢复数据收敛到一个
文件夹，但运行时仍允许 `templateDirectory: "."`，已有文件夹升级后可能没有
`templates/`。备份契约和页面也仍能选择旧 v1 目录包。这会让“工作区是一个固定结构的
文件夹”产生两套真实布局，并让路径、恢复和跨平台验证持续承担历史分支。

产品现在明确只维护当前版本；旧项目、旧 marker、旧全局业务数据库、旧目录备份和旧
文件计划 JSON 都不再是可导入数据源。同时，当前 AI Provider、题目分析、模板入库、
完整目录上下文、总体文件计划、预览、执行、备份和回滚能力必须保持。

## 决定

1. 工作区只有以下一种结构：

   ```text
   <workspace>/
     workspace.awb.json
     templates/
     problem-assets/images/
     .awb/workspace.sqlite
     .awb/file-plan-backups/
     .awb/restore-preflight-backups/
     .awb/recovery/
     .awb/cache/
   ```

2. `workspace.awb.json` 当前格式为 `formatVersion: 2`，且
   `templateDirectory` 只能为 `templates`。旧 marker 只读拒绝；不自动猜测、原位继续
   运行或从全局旧业务表补数据。

3. “新建工作区”只接受空白文件夹。“打开工作区”遇到没有 marker 的普通文件夹时先
   只读扫描并征得用户确认，再将其完整顶层内容迁入 `templates/`。已有 `templates/`
   时保留其内部结构，并把其余无冲突顶层条目迁入其中。

4. 升级预检拒绝符号链接、非普通文件、保留名称、非 NFC 名称、同层大小写/Unicode
   冲突以及迁入 `templates/` 后的目标冲突。迁移使用同文件系统暂存目录；每个原条目在
   迁移前后计算包含相对名称和原始文件字节的 SHA-256 指纹。只有全部指纹、SQLite
   `quick_check` 和外键通过后才发布数据库和 marker。任何失败都按逆序补偿回滚；若回滚
   也失败，保留暂存现场并明确要求停止修改。

5. 当前外部备份只有单文件 `.awb-backup v2`：必须包含一个工作区、完整模板源码、当前
   数据库快照、题目图片和必要撤销备份，并继续使用 UTF-8/EFS、NFC、Windows 路径规则、
   SHA-256 和严格 ZIP 解包限制。旧 v1 目录包、缺源码 v2 和多工作区包不再兼容。

6. 恢复前预备份也使用当前单文件 v2，不再生成旧目录包。未发布的包内容在系统临时
   目录中构建，避免工作区路径与长随机 staging 名叠加后超出 Windows 路径边界；临时
   ZIP 使用预备份目录内的紧凑名称，验证后再在同目录原子重命名为最终 `.awb-backup`。
   恢复 journal、清理 journal 和数据库提交标记使用当前 v2 内部契约；不读取旧中断现场。

7. AI 的当前功能和安全边界不变。`WorkspaceRecord.rootPath` 在 Main 内继续解析为固定
   `templates/`，Renderer 展示工作区容器路径；总体文件 AI 仍接收当前工作区的完整目录
   树和每个模板的 ID、名称、相对路径，继续使用一次性预览快照、Main 路径/版本校验、
   用户确认、操作前备份、补偿回滚与撤销冲突检查。

8. 当前文件计划数据库内容只接受 `schemaVersion: 2` 的封装 payload。AI 请求/响应自身
   仍保留版本化 Schema，这属于当前协议，不是旧数据兼容层。

9. 当前 `update-metadata` 计划必须由 Main 注入 `previousMetadata` 快照后才能落库。删除
   旧软归档计划列表、旧隔离数据面板及其 Preload/IPC 入口；当前 v2 恢复中断
   处理继续保留。这些收缩不改变 Provider Adapter、AI 输出 Schema、完整目录上下文、
   分批生成、请求预览、计划执行或回滚。

## 后果

- 工作区文件夹名可以不同，但其内部布局始终一致，模板相对路径统一从 `templates/`
  起算；复制整个工作区文件夹即可复制其业务数据。
- 用户必须在升级确认后接受一次真实文件移动；换来的是唯一布局、可预测备份恢复和更
  清晰的 macOS/Windows 测试矩阵。
- 旧版本工作区或备份不会被静默改写。需要保留旧数据时，应先使用对应旧版应用导出为
  当前支持格式；当前应用本身不提供转换器。
- 数据库 migration 仍用于当前源码 schema 的可审计创建与演进，但不再承担旧产品格式
  或旧全局业务数据的导入。

## 验收

- 空白新建和普通文件夹升级都得到同一目录结构，marker 只含当前格式。
- 升级前后每个文件原始字节一致；符号链接、NFC/大小写冲突、目标冲突和故障注入均不
  留下半迁移状态。
- 旧 marker、旧目录备份、缺源码包、多工作区包和旧裸计划 JSON 均被拒绝。
- 当前备份可深拷贝到任意活动工作区，恢复后切换离开再切回和重启均保持数据。
- Windows 长工作区路径下的恢复预备份不在工作区内嵌套长临时目录，且发布前后均通过
  完整性验证。
- 总体文件 AI 的完整目录/模板目录身份、计划生成、预览、确认、执行和回滚测试继续通过。

## 2026-07-28 实测

- `npm run check` 通过 TypeScript、ESLint 0 warning、Prettier、49 个 Vitest
  文件/375 项和 8 项发布脚本测试。
- 完整真实 Electron E2E 为 57 项通过、2 项 packaged 在未设置应用路径时
  按条件跳过。Provider 4/4、题目 AI 7/7、总体文件 AI 5/5、模板入库与
  元数据 AI 8/8 均通过；现有 AI 产品代码未因本 ADR 收缩而修改。
- 新建/普通文件夹升级、旧 marker 拒绝、当前 v2 备份深拷贝、故障回滚、
  提交前后中断恢复与工作区数据隔离均通过真实 Electron 入口。
- 当前 dirty 工作树用 `package:dir` 生成的 macOS arm64 测试 App 通过全新/
  已有 V2 userData packaged smoke 2/2。`app.asar` SHA-256 为
  `3d5f546c25e23d96a9be6c58a693a7c444f9eeceeb4a59b6f3ed007f4a1ee32a`；该 App
  仅为 ad-hoc/linker-signed、无 TeamIdentifier、未公证的测试目录包。
