# Changelog

本文件记录用户可见变化。发布版本以 `package.json` 为唯一机器可读事实源；候选制品的摘要和签名状态由发布流水线生成，不在此手工固化。

## [Unreleased]

暂无。

## [0.1.3] - 2026-07-28（RC1 Preview）

### Added

- 模板库新增从当前工作区选择单份、多份或分类导出模板册的完整桌面流程，支持只导出代码或附带基础元数据，并生成稳定可复现的 LaTeX。
- 导出可选生成紧凑双栏目录和代码高亮 PDF（优先使用 Electron 内置打印引擎，无需本机安装 TeX），以及 Word/Office 可打开的 `.doc`（RTF 容器）。
- PDF 目录改为分类/子目录到模板的嵌套树形结构，便于在多层模板库中快速定位。

- 工作区统一为可直接复制的自包含文件夹：`workspace.awb.json`、`templates/`、题目图片和工作区 SQLite/撤销数据都位于同一根目录；普通模板文件夹可在确认后安全升级为该格式。
- 已有模板支持单份或批量 AI 补全空白元数据；无效文件执行记录可在 AI 管理中预览、复检并安全删除。
- 批量 AI 任务显示真实阶段和进度；总体文件 AI 使用输出感知分批，并把单批最大输出提高到 4,096 Token。

### Changed

- 模板、题目、关系、总体文件 AI、数据状态和备份恢复全部以当前工作区为唯一业务边界。
- `.awb-backup v2` 固定深拷贝当前工作区的完整源码和业务数据；正确备份可原地恢复到任意当前工作区，目标文件夹名称、路径和 UUID 保持不变，来源身份只用于溯源。
- 中文源码统一支持 UTF-8、UTF-16LE/BE BOM 与 GB18030/GBK/CP936；跨平台备份保持源码原始字节、UTF-8/EFS 文件名和 NFC 路径。
- 恢复预备份暂存改到系统临时目录并使用紧凑 ZIP 文件名，降低 Windows 长路径失败风险。

### Compatibility

- 本版本只接受当前自包含工作区和完整单工作区 `.awb-backup v2`，不兼容旧 marker、旧目录备份、缺少源码的备份或多工作区包。
- AI Provider 和密钥仍为应用级设置，不进入工作区或备份；跨操作系统后需要在目标系统重新保存 API Key。

### Validation status

- `npm run check` 通过 TypeScript、ESLint 0 warnings、Prettier、49 个 Vitest 文件/375 项和 8 项发布脚本测试；备份恢复定向 Electron E2E 5/5、完整 Electron E2E 57 项通过，2 项 packaged 因尚未提供新候选路径按条件跳过。
- 用户已在真实 Windows 上测试上一份 `0.1.2` 未签名安装包并反馈所测流程未发现问题；首次 AI 鉴权失败在重新保存 Windows 本机 API Key 后恢复。
- 该反馈没有配套 `windows-acceptance-evidence.json`，不能据此逐项宣称安装升级、快捷方式、卸载和数据保留脚本全部通过；Windows Authenticode 仍未完成。
- `0.1.3` RC1 macOS arm64 Preview 已从干净提交 `797700e` 生成并通过架构、版本、DMG、ZIP、SHA-256、SBOM、隐私与 packaged smoke 2/2 验证。
- `0.1.3` RC1 Windows x64 Preview 已在原生 Windows runner 从产品基线 `b69cab2` 生成；安装器 SHA-256 为 `fd3f3b11faa48edba2087f89041146a1de12e3c65fe48b34cc4b339c05268064`，主程序与 `better_sqlite3.node` 均为 x64，隐私扫描和 packaged smoke 2/2 通过。该候选未签名，真实 Windows 安装/升级/卸载与 Mac→Windows→Mac 往返仍需实机验收。
- `0.1.3` RC3 G1 模板导出已通过 TypeScript、ESLint、Vitest（51 个文件/382 项）和真实 Electron 导出 E2E；macOS arm64 Preview 的 `.app`、DMG、ZIP、SBOM、SHA-256 与隐私检查以发布候选元数据为准。

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
- 本次 G1 Preview 仅在 macOS arm64 构建和验收；Windows 本轮未重新构建或实机验收。
- 本候选未签名、未公证，不代表 Gatekeeper 或 Windows SmartScreen 已通过；安装前请核对发布附带的 `SHA256SUMS.txt`。
