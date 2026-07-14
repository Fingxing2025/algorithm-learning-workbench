# 发布与打包

## 版本与环境

- 当前版本：`0.1.1`
- 开发环境：Node.js 24 或更高版本
- 桌面运行时：Electron 43.1.0
- 打包器：electron-builder 26.15.3
- 原生依赖：`better-sqlite3`，打包前必须针对当前 Electron ABI 重建

## 发布前验证

```bash
npm ci
npm run rebuild:native
npm run check
npm run test:e2e
npm audit --audit-level=moderate
```

开发目录产物：

```bash
npm run package:dir
```

macOS DMG 与 ZIP：

```bash
npm run dist:mac
hdiutil verify release/算法学习工作台-0.1.1-mac-arm64.dmg
shasum -a 256 release/*.dmg release/*.zip
```

Windows x64 NSIS：

```bash
npm run dist:win
```

CI 在 Ubuntu 执行静态检查/单元测试/依赖审计，在 macOS 执行真实 Electron E2E，并在 macOS 与 Windows runner 构建平台产物。CI 配置存在不等于 Windows 实机安装验证已完成。

## 打包入口 smoke test

构建 macOS 产物后，以全新应用数据目录启动真实二进制：

```bash
PACKAGED_APP_PATH="release/mac-arm64/算法学习工作台.app/Contents/MacOS/算法学习工作台" \
node ./node_modules/@playwright/test/cli.js test tests/e2e/packaged.spec.ts
```

该测试验证首次启动页、运行时版本、Preload API，以及 Renderer 中 `process`/`require` 不可见。

## 签名与发布门禁

当前开发机没有有效 Developer ID identity，因此 macOS DMG/ZIP 未签名、未 notarize，只能作为开发预览。公开发布前必须：

1. 在受保护 CI 发布环境配置 macOS Developer ID Application 和 notarization。
2. 配置 Windows Authenticode 证书并验证 NSIS 安装/卸载。
3. 验证签名、生成 SHA-256 与可选 SBOM/attestation。
4. 从可信渠道发布，并在发布页明确版本、架构、校验值和已知限制。

## 数据兼容与回滚

- 全新应用数据目录必须能完成首次设置，不依赖旧项目或示例数据。
- V2 数据升级只通过 `src/main/database/migrations.ts` 中的版本化 migration；不得要求用户删除数据库。
- 模板文件计划执行前保留备份；执行失败会恢复已完成步骤，撤销成功会清理对应备份。
- 安装包不应包含数据库、个人模板、题目、Provider、API Key、测试输出或本机绝对路径。

## 本地验证记录

### 0.1.1（2026-07-15）

- 新增 DeepSeek 官方 OpenAI-compatible 快捷预设，默认使用 `deepseek-v4-flash`。
- 新增阿里云百炼快捷预设，默认使用 `qwen-plus`，并要求填写当前百炼工作空间兼容端点。
- Provider 协议、密钥存储和数据库结构没有变化，既有 0.1.0 配置可原位继续使用。

macOS arm64、Electron 43.1.0 开发预览产物：

| 产物                                 |       大小 | SHA-256                                                            |
| ------------------------------------ | ---------: | ------------------------------------------------------------------ |
| `算法学习工作台-0.1.1-mac-arm64.dmg` | 约 130 MiB | `114a5c45056baac59fd31ca2f8cbb8b120abb1829867117a85b1c9109e9b2816` |
| `算法学习工作台-0.1.1-mac-arm64.zip` | 约 145 MiB | `c2a7e8c7d6ce25bcfba38be2c3efe199ba51d3a5f197f16bc6c7b233b1d29b7f` |

`hdiutil verify` 返回有效；应用主程序为 Mach-O 64-bit arm64。`codesign` 显示 ad-hoc 签名、无 TeamIdentifier，符合“未签名开发预览”的披露。重新打包后校验值会变化，正式发布必须以同一次发布流程重新生成并记录。
