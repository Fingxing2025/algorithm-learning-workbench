# 发布与打包

## 版本事实与发布边界

- 当前源码版本：`0.1.3`；当前候选标签为 RC1 Preview，尚不是正式签名发布。
- RC1 是候选阶段标签，不写入原生版本号后缀；macOS bundle 与 Windows PE/NSIS 使用跨平台兼容的数字版本 `0.1.3`，候选迭代由分支、提交、构建元数据和 SHA-256 区分。
- 唯一机器可读版本事实源：`package.json`；`package-lock.json` 必须保持相同名称和版本。
- 产品名：`算法学习工作台`。
- App ID：`com.algorithmworkbench.desktop`。
- macOS 候选：arm64 DMG + ZIP。
- Windows 候选：x64 NSIS。
- 开发环境：Node.js 24 或更高版本。
- 桌面运行时：Electron 43.1.0。
- 打包器：electron-builder 26.15.3。
- 原生依赖：better-sqlite3 12.11.1；候选必须证明 `better_sqlite3.node` 与目标架构一致，并通过真实打包入口启动。

发布模式严格分离：

- `preview`：脚本移除签名与 notarization 环境变量、关闭证书自动发现，只能生成明确标注的 unsigned/ad-hoc 预览候选。
- `signed`：缺少平台证书或公证凭据时立即失败；构建后仍必须通过签名、TeamIdentifier/notarization 或 Authenticode 验证。
- Windows CI 构建或签名验证不等于真实 Windows 安装、升级、权限与卸载验收。

决策依据见 `docs/decisions/0018-release-candidate-pipeline-and-platform-evidence.md`。

## 源码与质量门禁

```bash
npm ci
npm run rebuild:native
npm audit --audit-level=moderate
npm run check
npm run test:e2e
```

候选预检拒绝 dirty 的已跟踪源码和非受保护的意外未跟踪文件；本地受保护的未跟踪 `问题反馈.txt` 不计入候选 dirty 状态。`.codex/config.toml` 必须保持未修改，`release/` 必须继续由 Git 忽略。

## macOS arm64 预览候选

```bash
npm run release:mac:preview
```

该命令按顺序执行：

1. 校验版本、appId、productName、架构、Git 状态、ASAR、原生模块解包、hardened runtime 与最小 entitlement。
2. 只删除当前版本 `mac/arm64/preview` 的预期输出，不使用 `release/*` 混入历史版本。
3. 构建一次 macOS arm64 App、DMG 与 ZIP。
4. 验证 Info.plist、App/原生模块架构、DMG 完整性、签名/公证真实状态和包内容隐私边界。
5. 生成 SHA-256、CycloneDX SBOM、构建元数据、验证报告和发布说明草稿。

当前版本的精确输出为：

```text
release/算法学习工作台-0.1.3-mac-arm64.dmg
release/算法学习工作台-0.1.3-mac-arm64.zip
release/mac-arm64/算法学习工作台.app
release/candidates/0.1.3-mac-arm64-preview/
  SHA256SUMS.txt
  RELEASE_NOTES.md
  artifact-verification.json
  build-metadata.json
  sbom.cyclonedx.json
```

`release/` 中可能仍有历史版本；只有当前候选证据目录里的 `SHA256SUMS.txt` 是本次候选的摘要来源。

本地复核摘要时从 `release/` 作为工作目录运行，以便校验文件中的精确制品名正确解析：

```bash
(cd release && shasum -a 256 -c candidates/0.1.3-mac-arm64-preview/SHA256SUMS.txt)
```

## 打包入口 smoke

候选生成后必须从真实二进制分别验证全新 userData 和已经写入 V2 数据后的重启：

```bash
PACKAGED_APP_PATH="release/mac-arm64/算法学习工作台.app/Contents/MacOS/算法学习工作台" \
node ./node_modules/@playwright/test/cli.js test tests/e2e/packaged.spec.ts
```

这两个 smoke 场景验证首次启动、运行时版本、Preload/Renderer 隔离、工作区和模板落盘，以及相同 userData 重启后的数据可见性。旧 schema 的原位升级仍由完整 E2E 中的 migration 场景覆盖。

## macOS 正式签名与 notarization

不要在聊天、源码、日志或制品中传递证书密码、私钥或 Apple 凭据。应在本机 Keychain 或受保护 CI secrets 中配置。

推荐 notarization 凭据：

- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

GitHub Actions 中把 `.p8` 内容以 base64 保存为 `APPLE_API_KEY_BASE64` secret；工作流只在 signed job 的临时目录解码，并通过 `APPLE_API_KEY` 传递临时路径，结束时删除。`APPLE_API_KEY_ID` 与 `APPLE_API_ISSUER` 分别使用独立 secret。不要把 `.p8` 文件提交到仓库或作为候选制品上传。

签名身份可由 Keychain 中的 `Developer ID Application` 提供，或通过受保护的 `CSC_LINK` / `CSC_KEY_PASSWORD` 交给 electron-builder 导入。electron-builder 文档化的 Apple ID 三元组或 Keychain Profile 也可用于 notarization，但 API key 方式优先。

```bash
npm run release:mac:signed
```

正式命令只有在以下项目全部成立时才成功：

- App 通过 `codesign --verify --deep --strict`。
- Authority 为 `Developer ID Application` 且存在 TeamIdentifier。
- notarization ticket 已 staple 并通过 `stapler validate`。
- Gatekeeper `spctl` 接受 App。
- DMG、App、better-sqlite3、版本、架构、隐私扫描、SHA-256 和 SBOM 来自同一候选。

当前开发机没有有效 Developer ID identity，也没有本 Session 可用的 notarization 凭据，因此只能生成预览候选；不得把该状态写成正式发布通过。

## macOS entitlement

`build/entitlements.mac.plist` 与 `build/entitlements.mac.inherit.plist` 只启用：

- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.allow-unsigned-executable-memory`

当前不启用 `com.apple.security.cs.disable-library-validation`。如未来真实签名候选的同 Team 原生模块仍无法加载，必须先记录证据并更新 ADR，不能直接放宽。

## Windows x64 候选与实机验收

Windows 预览/正式候选必须在原生 Windows runner 或主机生成：

```powershell
npm run release:win:preview
# 配置受保护的 WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD 后：
npm run release:win:signed
```

CI 对 `win-unpacked/算法学习工作台.exe` 运行全新/已有 V2 userData 的打包入口 smoke，并验证 x64 PE、better-sqlite3、版本、隐私内容和 Authenticode 真实状态。但这仍不是 NSIS 实机安装证据。

把候选复制到真实 Windows 主机后，先从 `SHA256SUMS.txt` 取得安装器摘要，再运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release/windows-acceptance.ps1 `
  -InstallerPath "release/算法学习工作台-0.1.3-win-x64.exe" `
  -Mode Preview `
  -ExpectedVersion "0.1.3" `
  -ExpectedSha256 "<SHA256SUMS.txt 中的值>" `
  -ExistingV2UserDataPath "<测试副本路径>" `
  -EvidencePath "windows-acceptance-evidence.json"
```

脚本会检查安装器摘要/签名、静默安装、App 版本与签名、全新和已有 V2 userData 启动、桌面/开始菜单快捷方式、静默卸载和 userData 保留。执行后仍必须人工确认 UI、已有模板/题目/关系/图片/Provider 状态和安装权限。测试已有数据时只能使用备份副本，不要直接拿唯一生产 userData 做验收。

上一份 `0.1.2` 未签名安装包已经由用户在真实 Windows 上测试，用户反馈所测流程没有发现问题；AI 首次鉴权失败在 Windows 本机重新保存 API Key 后恢复，符合密钥不跨操作系统复制的设计。由于没有配套的 `windows-acceptance-evidence.json`，该反馈只能作为真实主机探索性验收，不能替代脚本对安装升级、快捷方式、卸载和 userData 保留的逐项证据。`0.1.3` RC1 仍需重新生成原生 Windows 候选，Authenticode 也仍未完成。

## 产物隐私与供应链检查

候选检查会列出 ASAR 和外部 Resources，拒绝：

- SQLite/数据库、`.awb-backup`、日志、证书、私钥和环境文件。
- `secrets/`、题目图片、文件计划备份、批量导入备份、恢复预备份和隔离区。
- 测试输出、Playwright 报告、用户模板源码和应用代码中的开发者绝对路径。
- 常见高置信度私钥、云凭据和 API key 形态。

SBOM 由 npm 自带的 CycloneDX 生成能力创建，不引入运行时依赖。SBOM 描述依赖组成，但不能替代代码签名、漏洞审计或发布渠道 provenance。

GitHub Actions 使用固定 commit SHA 的 checkout、setup-node 与 upload-artifact；工作流权限保持 `contents: read`。手动 `release-candidate` 工作流的 `preview` 模式不会使用传入 secrets，`signed` 模式缺凭据会失败。

## 数据兼容与回滚

- 全新应用数据目录必须能完成首次设置，不依赖旧项目或示例数据。
- 已有 V2 数据只通过版本化 migration 原位升级，不得要求删除数据库。
- 模板文件计划执行前保留备份；数据管理页支持校验备份、恢复预览、恢复前备份、中断恢复、隔离与系统废纸篓移交。
- 安装包不得包含 userData、数据库、个人模板、题目、图片、Provider、API Key、测试输出或本机绝对路径。
- 自动更新、更新回滚和签名轮换仍未决；实现前必须新增 ADR。

## 候选、源码与正式发布状态

- 最终源码 HEAD：以当前交接文档所在最终提交为准；候选生成后如再提交证据文档，最终 HEAD 会晚于候选来源提交，两者必须分开记录。
- `0.1.3` RC1 来源：当前发布分支 `codex/release-0.1.3-rc.1`；精确候选提交以新 `build-metadata.json` 为准。
- `0.1.3` RC1 源码门禁：`npm run check` 通过 49 个 Vitest 文件/375 项和 8 项发布脚本测试；`tests/e2e/data-management.spec.ts` 5/5，完整真实 Electron E2E 57 项通过、2 项 packaged 条件跳过。
- 最后已验证打包版本暂为历史 `0.1.2` macOS arm64 preview；`0.1.3` RC1 只有完成本轮构建、验证和 packaged smoke 后才可替换该结论。
- 正式签名版本：不存在。本机 `security find-identity -v -p codesigning` 为 `0 valid identities found`，不得把 ad-hoc App 描述为 Developer ID signed/notarized。
- Windows 实机状态：上一份 `0.1.2` 未签名包已有用户探索性实测且所测流程无已知问题；没有脚本生成的逐项验收 JSON。`0.1.3` 原生候选、Authenticode 和正式安装/升级/卸载证据仍未完成。

计划中的 RC1 候选证据目录：`release/candidates/0.1.3-mac-arm64-preview/`。在该目录由本轮流程实际生成前，不复用下方 `0.1.2` 历史摘要。

| 制品                                 |      字节数 | SHA-256                                                            |
| ------------------------------------ | ----------: | ------------------------------------------------------------------ |
| `算法学习工作台-0.1.2-mac-arm64.dmg` | 138,104,754 | `798c94f809bb42a87eb2bff12c861f507c3b6c8fc44c5e1cf0b357a3ac742662` |
| `算法学习工作台-0.1.2-mac-arm64.zip` | 137,580,378 | `e918b578d465b5eda1c146e14dff2d30721a4f1c7a941baddd1c4a922f73943b` |

- App 主程序与 `better_sqlite3.node`：Mach-O 64-bit arm64；Electron module ABI `148`。
- Info.plist：appId `com.algorithmworkbench.desktop`，版本/build `0.1.2`，最低 macOS `12.0`；源 PNG 与打包 `icon.icns` 均 1024×1024 alpha，四角透明，alpha bbox `(48,48)-(976,976)`。
- DMG `hdiutil verify`、ZIP 完整性和 `SHA256SUMS.txt` 复核通过；CycloneDX SBOM 为 1.5、93 个组件。
- 隐私扫描：ASAR 10,739 条目、App 文件 316 个；禁用条目、禁用外部文件、个人绝对路径和疑似密钥均 0 命中。
- packaged smoke：全新 userData 与已有 V2 userData 重启各 1 项通过。
- 签名：unsigned/ad-hoc，无 Authority/TeamIdentifier，未 staple，Gatekeeper 不接受；仅适合测试分发，不是正式签名版本。

## 历史本机候选记录

Session C 最终候选来自干净提交 `5817eab7ab0274b6dcc8830334e300dfe1cbe2ae`，完整证据位于 `release/candidates/0.1.2-mac-arm64-preview/`：

| 产物                                 |      字节数 | SHA-256                                                            |
| ------------------------------------ | ----------: | ------------------------------------------------------------------ |
| `算法学习工作台-0.1.2-mac-arm64.dmg` | 138,091,048 | `992ec6da84aef0c41522472063f62ab4f955be2457057a400fd4ce700a931d64` |
| `算法学习工作台-0.1.2-mac-arm64.zip` | 137,555,476 | `5cf10814dca42f0ee97861967ce22d5cc3dfce33d2426a3d74bcbd72497f8164` |

- App 主程序：Mach-O 64-bit arm64。
- `better_sqlite3.node`：Mach-O 64-bit arm64；Electron module ABI 148。
- Info.plist：版本/build version `0.1.2`，identifier `com.algorithmworkbench.desktop`，最低 macOS `12.0`。
- 源 PNG 与打包 `icon.icns`：1024×1024，带 alpha；打包图标 SHA-256 为 `757fbc72d2730d53263719633c5bc730db5b53c4c9f3cb5e17d91cb72ebb5e72`。
- `hdiutil verify`、候选 `SHA256SUMS.txt` 复核和两项打包入口 smoke 均通过。
- 隐私扫描：10,739 个 ASAR 条目、316 个 App 文件；禁用条目、用户绝对路径和疑似密钥均 0 命中。
- 签名：ad-hoc、无 Authority/TeamIdentifier、未 staple、Gatekeeper 不接受；signed 预检因本机 `0 valid identities found` 按设计失败。

旧的 0.1.0/0.1.1/0.1.2 文件若不在上述证据目录中引用，都只是历史本地产物，不得沿用其摘要或签名判断。每次重建压缩包，摘要都可能变化，必须以新候选重新生成。
