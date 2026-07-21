# Changelog

本文件记录用户可见变化。发布版本以 `package.json` 为唯一机器可读事实源；候选制品的摘要和签名状态由发布流水线生成，不在此手工固化。

## [Unreleased]

- Session F 十个行为保持切片完成并正式冻结：应用壳、模板管理服务、AI Provider、题目分析关联、题目详情、文件管理历史/计划审查/只读审计和数据管理备份/恢复/异常中断恢复均已按语义边界归位。
- 保持现有产品模块、视觉系统、IPC、SQLite schema、迁移、Provider 协议和安全边界不变；本次收尾不新增功能、不重构业务代码。
- 由干净源码提交 `39421c0329c463657cb43c4e552949e48bee93c9` 生成 macOS arm64 unsigned/ad-hoc beta 候选；候选摘要、SBOM、架构、隐私和 packaged smoke 证据位于 `release/candidates/0.1.2-mac-arm64-preview/`。该产物只用于测试分发，不是正式签名版本。

## [0.1.2] - 2026-07-18

### Added

- 完成 V2 数据备份、校验、恢复、恢复前备份、中断恢复、数据生命周期诊断、隔离与系统废纸篓移交。
- 完成 OpenAI-compatible Chat Completions、OpenAI Responses、Anthropic Messages、Gemini GenerateContent 与 Ollama 的统一结构化任务、取消、有限重试和可操作错误契约。
- 新建题目统一支持手工录入、文本/图片 AI 草稿和多份本地模板关联建议。
- 模板支持安全重命名或移动真实源码，保持模板 ID、元数据和题目关系，并在故障时补偿回滚。
- 新增可复现的候选发布预检、精确制品选择、SHA-256、CycloneDX SBOM、构建元数据、隐私检查和发布说明草稿。

### Changed

- 模板树按工作区保存展开状态；模板统计统一为当前工作区实际可用模板。
- 文件计划历史使用内部滚动区，并通过软归档安全清理记录，不删除撤销证据或用户文件。
- App 图标使用透明画布上的蓝紫品牌图标，打包产物不再带外围白底。

### Security

- Renderer 保持 sandbox、context isolation 与无 Node integration；文件、SQLite、密钥和 Provider 网络继续只由 Main 处理。
- macOS 正式候选采用最小 hardened-runtime entitlement；缺少 Developer ID/notarization 凭据时正式发布命令失败，不退化为未签名包。

### Known limitations

- 当前开发环境没有 Apple Developer ID/notarization 凭据；本机只能生成明确标注的 unsigned/ad-hoc macOS 预览候选。
- Windows NSIS 尚未完成真实 Windows 主机上的安装、已有数据升级、快捷方式、权限和卸载验收。
- 自动更新仍不在当前版本范围。
