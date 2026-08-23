# ADR-0018：发布候选流水线与平台证据边界

- 状态：已接受
- 日期：2026-07-18
- 范围：Session C

## 背景

V2 已能生成 macOS arm64 DMG/ZIP 和 Windows x64 NSIS，但现有流程把开发预览、CI 打包、平台签名和真实安装验收写在相邻步骤中，容易把“构建成功”误报为“可正式发布”。当前开发机没有有效的 Apple Developer ID，现有 macOS App 没有 TeamIdentifier 或 notarization ticket；当前环境也没有可执行 Windows 安装、升级和卸载验收的真实主机。`release/` 同时保留多个历史版本，使用宽泛 glob 生成校验值还可能混入旧产物。

发布制品拥有 Main 进程的文件、SQLite、安全存储和网络权限。候选包若被替换、错误签名，或意外包含 userData、用户源码、题目、密钥、日志和本机路径，会直接破坏本地优先产品的数据与供应链边界。

## 决定

1. `package.json` 的 `version` 是唯一机器可读版本事实源；产品名、appId、Electron、electron-builder 和原生模块版本也从当前源码与 lockfile 读取，不在发布脚本中复制常量。
2. 发布命令分为 `preview` 与 `signed` 两种模式。预览模式显式关闭证书自动发现和 notarization 环境，只能标记为 unsigned/ad-hoc 候选，不能通过正式发布门禁。正式模式缺少平台签名身份或公证凭据时必须立即失败，不允许退化为未签名包。
3. macOS 正式模式要求有效的 `Developer ID Application` 身份，并使用 electron-builder 支持的受保护环境变量提供 notarization 凭据。优先使用 `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`；也允许其文档化的 Apple ID 或 Keychain Profile 三元组。证书、密码、API key 和私钥不得进入源码、日志、生成元数据或上传制品。
4. macOS 开启 hardened runtime。显式 entitlement 只保留 Electron/V8 所需的 `com.apple.security.cs.allow-jit` 与 `com.apple.security.cs.allow-unsigned-executable-memory`；不启用 `com.apple.security.cs.disable-library-validation`。若未来原生模块在真实签名候选中无法加载，必须先证明同 Team 签名仍不足，再单独更新本 ADR，不能静默放宽。
5. Windows 正式模式要求 Authenticode 签名材料，并在构建后验证安装器签名。Windows CI 构建、签名验证和真实 Windows 安装验收是三份独立证据；前两者不能替代真实主机上的安装、首次启动、已有 V2 数据升级、快捷方式、权限和卸载保留策略验证。
6. 每次候选只删除并重建“当前版本 + 当前平台 + 当前架构”的预期输出，不清理历史版本。校验和、元数据、SBOM 和发布说明只接受按 artifactName 精确推导出的本次 DMG/ZIP/NSIS，禁止使用 `release/*` 汇总历史文件。
7. 同一次候选流程必须生成 SHA-256、CycloneDX SBOM、构建元数据和发布说明草稿。元数据记录提交、版本、工具链、架构、制品大小/摘要、App/原生模块架构、签名与公证状态、隐私检查结果；不记录环境变量值、用户名目录或用户数据路径。
8. 产物验证必须检查 Info.plist/可执行文件版本、bundle identifier、目标架构、`better_sqlite3.node` 架构、DMG 完整性、平台签名状态和候选内容。包内不得出现数据库、备份包、密钥/证书、日志、测试输出、题目图片、用户模板源码或开发者绝对路径。
9. macOS 正式候选只有在 `codesign --verify --deep --strict`、Developer ID/TeamIdentifier、`notarytool` 结果、staple 校验和 Gatekeeper `spctl` 均成功时才可标记为 signed/notarized。预览候选只验证可执行性并明确记录这些门禁未通过。
10. 真实打包入口至少用全新 userData 启动；发布验收还必须使用已有 V2 userData 验证 migration 与数据保留。测试目录必须位于临时位置，不得被复制进安装包。自动更新继续不在本 Session 范围；启用更新渠道、签名轮换或降级策略前必须另写 ADR。
11. `release/` 继续由 Git 忽略。候选制品和生成证据通过受控发布渠道保存，源码仓库只提交脚本、CI、清单、ADR、CHANGELOG 与不含凭据的发布文档。

## 后果

- 没有 Apple/Windows 凭据的开发者仍可复现并验证预览候选，但不会得到“正式发布通过”的误导性结果。
- 同版本历史产物不会污染本次校验值；每份校验和都能追溯到精确版本、平台、架构和提交。
- 最小 entitlement 保持较强的 library validation；新增需要任意动态库加载的能力会被默认阻止并要求重新审查。
- npm 自带的 CycloneDX 生成能力避免新增运行时依赖，但 SBOM 只描述依赖组成，不替代签名、provenance 或漏洞审计。
- Windows 公共发布仍被真实主机验收阻塞；CI 中的 NSIS 产物只能证明可构建性。
