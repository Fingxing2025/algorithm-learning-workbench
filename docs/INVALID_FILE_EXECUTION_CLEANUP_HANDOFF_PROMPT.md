# 失效执行记录清理：当前交接说明

> 历史提示词已被 ADR-0026 取代。禁止再按“跨全部工作区查询或清理失效记录”实现。

当前标准：

- 失效执行记录的列表、计数、数据状态、预览和确认都只处理当前工作区。
- Renderer 不提交任意工作区 ID；Main 从活动工作区解析边界。
- 切换到其他工作区后，不得看到或清理原工作区的记录；切回原工作区后数据仍在。
- ADR-0025 的安全语义继续保留：只允许 `applied`、canonical 受管备份目录确实缺失的记录进入清理；默认不选；预览一次性且有 TTL；确认前重新检查；任一变化整批拒绝；只删除执行行并保留父计划、当前文件和有效备份。
- 数据状态中的缺失撤销备份提示与 AI 管理的可处理列表必须使用同一当前工作区和同一判定。

实现与验收以以下文件为准：

- `docs/decisions/0026-current-workspace-data-boundary.md`
- `docs/decisions/0025-invalid-file-execution-cleanup.md`
- `src/main/services/file-execution-integrity-service.ts`
- `src/main/services/template-file-plan-history-service.ts`
- `src/main/database/template-management-repository.ts`
- `tests/e2e/file-management.spec.ts`

完成定义：在工作区 B 看不到工作区 A 的失效记录；切回 A 后可按预览和二次确认清理；B 的数据/源码、A/B 有效备份、父计划和当前模板文件均不变。
