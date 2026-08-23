# 智能算法学习助手 V2

[English](README.en.md)

面向所有算法学习者的本地优先桌面工作台。用户可以从空白工作区开始建立自己的模板、题目、关联关系和多供应商 AI 配置。

## 当前状态

V2 [`0.1.3 RC2 Preview`](https://github.com/Fingxing2025/algorithm-learning-workbench/releases/tag/v0.1.3-rc.2) 已公开发布。它是未签名的预发布版本，不是正式稳定版：macOS 仅支持 Apple Silicon（arm64，macOS 12+），Windows 仅支持 x64；请仅从 Release 页面下载，并先校验 `SHA256SUMS.txt`。

与该标签对应的源码门禁已通过：49 个 Vitest 文件/377 项、8 项发布脚本测试和 59 项常规 Electron E2E。macOS arm64 与 Windows x64 产物已完成架构、版本、SHA-256、SBOM、隐私检查和全新/已有 V2 userData 的 packaged smoke 2/2。正式发布仍受 macOS 签名/公证和 Windows Authenticode 阻塞；完整风险与限制以 Release 页面为准。

当前包不具备 macOS Developer ID/notarization 或 Windows Authenticode 签名。Windows RC2 已有真实安装使用反馈，但尚未形成完整的安装、升级、卸载和跨平台备份往返自动化证据。详见 [发布说明](docs/RELEASE.md) 和 [用户指南](docs/USER_GUIDE.md)。

### macOS 命令安装（Apple Silicon）

如果不想手动下载 DMG，可在终端下载、校验并运行官方安装脚本：

```bash
curl -fLO https://github.com/Fingxing2025/algorithm-learning-workbench/releases/download/v0.1.3-rc.2/install-macos-preview.sh
curl -fLO https://github.com/Fingxing2025/algorithm-learning-workbench/releases/download/v0.1.3-rc.2/SHA256SUMS.txt
grep 'install-macos-preview.sh$' SHA256SUMS.txt | shasum -a 256 -c -
sh install-macos-preview.sh
```

校验通过后，脚本会下载并复核 DMG，安装到 `~/Applications`，再仅移除该已验证预览 App 的下载隔离标记；遇到已有同名 App 时会停止，不会覆盖。它不能替代 macOS 正式签名或公证。

## 已确定技术方向

- Electron + React + TypeScript + Vite
- Tailwind CSS + shadcn/ui/Radix UI
- SQLite + Drizzle ORM
- Vitest + React Testing Library + Playwright

## 开发参考

相邻目录 `../智能算法学习助手` 只用于核对旧版功能行为。V2 不提供旧版数据迁移，不依赖旧项目目录或数据格式，也不得覆盖旧版文件与未提交改动。

## 开始开发前

1. 阅读 `AGENTS.md`。
2. 阅读 `docs/V2_PRODUCT_SPEC.md`、`docs/ARCHITECTURE.md`、`docs/IMPLEMENTATION_PLAN.md` 和 `docs/QUALITY_GATES.md`。
3. 阅读 `docs/CODEX_SETUP.md` 了解工作区和 Skill 配置。
4. 涉及权限、数据或 AI 协议时阅读 `docs/decisions/` 中的 ADR。

## 本地开发

要求 Node.js 24。`better-sqlite3` 是原生依赖，首次安装依赖以及升级 Electron 后，需要针对当前 Electron ABI 重建：

```bash
npm install
npm run rebuild:native
npm run dev
npm run check
npm run test:e2e
```

## 发布候选

```bash
npm run release:mac:preview
# 正式命令缺少平台证书/公证凭据时会失败：
npm run release:mac:signed
```

Windows 候选必须在原生 Windows 主机或 runner 生成；CI 构建不等于实机安装验收。工程、数据、AI、文件计划和发布边界记录在 `docs/decisions/` 中的 ADR-0001 至 ADR-0031。威胁模型见 [安全威胁模型](docs/智能算法学习助手-v2-threat-model.md)，审查结论见 [安全最佳实践审查](docs/SECURITY_REVIEW.md)。
