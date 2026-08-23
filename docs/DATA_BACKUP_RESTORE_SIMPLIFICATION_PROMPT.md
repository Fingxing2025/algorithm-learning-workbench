# 当前工作区备份与恢复：交接提示词

```text
你在 <项目根目录> 中工作。

先读取 AGENTS.md、docs/V2_PRODUCT_SPEC.md、docs/ARCHITECTURE.md、docs/QUALITY_GATES.md、docs/decisions/0026-current-workspace-data-boundary.md，并重新检查 git status 与 HEAD。保留用户未提交改动；不修改 .codex/config.toml、问题反馈.txt 或相邻旧项目；不 stage、commit、push。

统一产品标准：当前活动工作区是模板、题目、关联、总体文件 AI、历史、失效记录、数据状态和备份恢复的唯一业务边界。Renderer 不能指定任意 workspace ID。

备份要求：
- v2 .awb-backup 只包含当前工作区的一条 workspace、所属模板/元数据/题目/图片/关联/文件计划/执行记录、受管撤销备份和可选模板源码。
- 不包含其他工作区、Provider/任务路由、密钥、无归属批量临时备份。
- SQLite 过滤后必须压实，避免已删除的其他工作区或 Provider 字符串留在空闲页。
- manifest、SQLite 与实际文件清单必须一致；不能只在文案中声称已过滤。

恢复要求：
- 选择 -> 自动校验 -> 显示 6 类当前/备份数量 -> 明示只替换当前工作区 -> 源码策略/新目录 -> 显式确认。
- 只替换当前工作区；其他工作区的数据库行、源码、题目图片、撤销备份和全局 Provider 保持不变。
- 旧多工作区或 manifest/SQLite 工作区不一致的包允许验证，但拒绝恢复并给出可操作提示。
- 继续保留恢复前工作区备份、staging、journal、目录交换、SQLite 事务和失败补偿。

关键验收：
- A/B 各有模板、题目、图片、关系和历史；在 B 导出只含 B。
- B 恢复后与备份一致；A 和 Provider 的计数/ID/文件哈希不变。
- 切换工作区后 Renderer 清空旧题目选择与旧搜索条件并重新加载。
- 全新 userData、既有 migration、空白当前工作区、亮暗主题和常用窗口尺寸通过。

主要测试：tests/e2e/data-management.spec.ts、workspace-data-boundary.spec.ts、file-management.spec.ts、migration.spec.ts。最后运行 npm run check、npm run test:e2e、git diff --check，并重新生成 macOS arm64 未签名/ad-hoc 测试 App；Windows 实机结果必须单独披露。
```
