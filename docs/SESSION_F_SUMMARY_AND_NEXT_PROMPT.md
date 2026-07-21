# Session F 第九切片总结与下一 Session 启动提示

- 日期：2026-07-21
- 主题：数据管理备份/恢复展示区行为保持拆分
- 本 Session 基线：`d942ce4 docs: hand off session f file management audit split`
- 特征测试提交：`361a7b6 test: characterize data backup restore workspace`
- 源码实现提交：`85064b6 refactor: split data backup restore panel`
- 文档交接提交：本文所在最终本地提交
- 分支：`main`
- 版本：`0.1.2`
- 远程：未推送
- 受保护文件：`.codex/config.toml` 未修改；`问题反馈.txt` 保持用户已有未跟踪状态，未暂存或提交

## 1. 本切片结论

Session F 第九切片完成了 `data-management-workspace.tsx` 中“导出与验证”区域的行为保持拆分。新组件承载导出范围勾选、导出/验证/恢复预览按钮、manifest 与校验结果、恢复冲突、恢复确认焦点以及恢复结果展示；父工作区继续协调生命周期/中断恢复/隔离流程、所有 `window.desktop.dataManagement` 调用、诊断刷新、恢复前后状态播报和页面组合。

`src/renderer/src/features/data/data-management-workspace.tsx` 从 1,164 行降至 1,029 行；新增 194 行的 `data-backup-restore-panel.tsx`。真实 Electron 入口、App 路由、布局、滚动、焦点、键盘、live region、主题、视觉 token 和 Preload API 均保持不变；新组件不访问 `window.desktop`。

## 2. Renderer 职责边界

| 文件                                 |  行数 | 职责                                                                                                    |
| ------------------------------------ | ----: | ------------------------------------------------------------------------------------------------------- |
| `data-management-workspace.tsx`      | 1,029 | 诊断、生命周期、隔离/撤销、中断恢复、所有命名 Preload 调用、`run` 错误/成功播报、恢复前后刷新和页面组合 |
| `data-backup-restore-panel.tsx`      |   194 | 导出范围、导出/校验/恢复预览操作、manifest/校验结果、冲突、确认焦点和恢复结果的受控展示                 |
| `data-management-workspace.test.tsx` |   193 | 3 项备份/恢复职责与调用特征测试，锁定导出、校验、恢复确认和结果播报                                     |

新组件只接收受控结果、布尔状态、焦点引用和回调。恢复请求仍由父组件使用原 `packagePath`、`confirmRestore: true` 和 `templateSourceStrategy: 'skip'` 构造；恢复完成后仍先重新诊断，再按 Provider 密钥是否需要重填播报。

## 3. 特征测试与验证

### 测试先行与逐提交门禁

- 先新增 3 项组件特征测试，再移动 JSX：
  1. 选择“包含模板源码副本”后导出，调用参数与 manifest 展示保持；
  2. “验证备份包”仍只调用命名 `verifyBackup` 并展示校验结果；
  3. 恢复预览后焦点进入确认复选框，只有显式确认才调用精确恢复参数，完成后保持密钥重填播报并触发第二次诊断。
- 测试提交前和实现提交前均通过定向 3 项 Vitest、typecheck、ESLint（0 warnings）与 Prettier。

### 完整代码与桌面门禁

- `npm run check`：TypeScript、ESLint（0 warnings）、Prettier、36 个 Vitest 文件/232 项通过、3 项发布脚本测试通过。
- `npm run test:e2e`：授权 GUI 与本地 mock 端口后单次完整运行 54 项常规真实 Electron E2E 通过，2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 2.7 分钟。首次沙箱运行的 Electron/端口 `EPERM` 已分类为环境限制，授权后重跑通过。
- 数据管理 E2E 继续覆盖全新 userData 导出/校验、已有 V2 数据恢复、恢复前预备份、模板源码跳过、Provider 密钥不恢复、篡改拒绝、故障回滚、中断恢复、隔离/撤销和废纸篓移交。

### Playwright 与截图

本切片无视觉意图，只移动原有 JSX 组合。完整 Playwright E2E 已通过；人工复用并复核既有 `output/playwright/session-d-final/` 数据管理截图矩阵：

- 1440×900、1280×720、1024×640；
- 亮色、深色和 200% 关键状态；
- 诊断、生命周期、导出/恢复区域的滚动边界、焦点、主题层级和主操作。

没有新增视觉 token、布局偏好或截图矩阵。

## 4. 数据、安全与兼容性

- SQLite：没有改变 schema、migration、索引或持久化字段。
- IPC/Preload：没有改变 IPC 名称、Zod 输入输出或 `DesktopApi`；所有数据管理调用仍只在父工作区，Renderer 无 Node、SQLite、文件系统或密钥权限。
- 备份/恢复：没有改变 `v1` manifest、校验、恢复前备份、模板源码 `skip` 策略、回滚或 Provider `secret_ref` 排除语义。
- 后台任务/Provider：没有改变后台任务、Provider 协议、请求上限、错误分类或取消边界。
- 全新 userData：空白工作区可以从真实桌面入口完成诊断、导出、校验和恢复预览；不依赖旧项目或预置个人数据。
- 已有 V2 userData：已有备份、题目、图片、关系、模板元数据和 Provider 非密钥配置继续原位工作；旧项目仍只读且未触碰。

## 5. 性能、平台限制与未提交文件

本切片只移动 Renderer 展示组合，没有改变扫描、查询、索引、分页、启动、备份算法或后台任务实现，因此未重跑 `PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance`。最近正式性能证据仍为 `output/performance/session-e-session-f-template-service-split-final.md`；不声明新的性能提升。

结束时实时检查 `security find-identity -v -p codesigning` 仍为 `0 valid identities found`；当前主机为 macOS arm64，没有真实 Windows 安装环境。因此 macOS Developer ID/notarization、Windows Authenticode/真实安装、macOS VoiceOver 长流程和 Windows Narrator/高对比实机检查仍未完成；Session F 未重新打包。

交接时 `git status --short` 只显示用户已有未跟踪 `问题反馈.txt`；`.codex/config.toml` 未修改、未暂存，旧项目未修改，也未推送远程。

## 6. 下一 Session 可直接复制提示词

```text
继续开发“智能算法学习助手 V2”。

工作目录：
/Users/ffxx/Desktop/项目/智能算法学习助手-v2

本 Session：
Session F 第十切片：继续大型 Renderer 文件行为保持拆分（或在外部凭据齐备时恢复 Session C 平台门禁）

当前基线：
先执行 git status --short、git log -5 --oneline 和 wc -l；以 docs/SESSION_F_SUMMARY_AND_NEXT_PROMPT.md 所在最终交接提交为准。

开始前完整阅读：
- AGENTS.md
- docs/PROJECT_STATUS_AND_HANDOFF.md
- docs/SESSION_F_SUMMARY_AND_NEXT_PROMPT.md
- docs/VISUAL_DESIGN.md
- docs/QUALITY_GATES.md
- docs/V2_PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/IMPLEMENTATION_PLAN.md

目标：
- 只做行为保持的维护性拆分，先建立职责/调用特征测试，再移动实现。
- 优先从 src/renderer/src/features/data/data-management-workspace.tsx 的生命周期/中断恢复剩余区域、features/problems/problem-analysis-dialog.tsx 的剩余题目字段/AI 区中选择一个边界清晰且尚未拆分的职责；数据管理备份/恢复区已在第九切片完成。
- 不要重复拆分 problem-analysis-relations.tsx、problem-details-panel.tsx、file-management-history-panel.tsx、file-management-plan-review-panel.tsx、file-management-audit-panel.tsx 或 data-backup-restore-panel.tsx。
- 保持真实 Electron 入口、App 路由、布局、焦点、键盘、live region、主题、视觉 token 和 Preload API 不变。
- 不改变 SQLite schema、migration、IPC、Zod、后台任务、备份格式、Provider 协议或安全上限。
- .codex/config.toml 与 问题反馈.txt 受保护；旧项目只读；不推送远程。

最低验收：
- 每个小提交运行相关 Vitest、typecheck、lint 和格式检查。
- 完成后运行 npm run check 与 npm run test:e2e。
- 若扫描/查询/启动受影响，再运行 PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance。
- 修改 UI 时使用 Playwright 并人工复核亮色、深色和紧凑截图；无视觉变化时明确复用既有矩阵。
- 更新五份交接文档，记录基线/提交/测试数量/职责边界/兼容性/性能/平台限制/未提交文件和下一步提示。
```
