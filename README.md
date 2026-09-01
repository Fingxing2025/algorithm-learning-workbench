# 智能算法学习助手 V2

[English](README.en.md)

面向所有算法学习者的本地优先桌面工作台。用户可以从空白工作区开始建立自己的模板、题目、关联关系和多供应商 AI 配置。

## 当前状态

V2 [`0.1.3 RC4 Preview`](https://github.com/Fingxing2025/algorithm-learning-workbench/releases/tag/v0.1.3-rc.4) 已公开发布。这是未签名预发布版本，不是稳定版：macOS 仅支持 Apple Silicon（arm64，macOS 12+），Windows 仅支持 x64；请仅从 Release 页面下载并先校验 `SHA256SUMS.txt`。

本次包含从当前工作区选择模板并导出 `.tex`、紧凑目录/高亮 PDF 和可选 `.doc` 的完整桌面流程；PDF 优先使用 Electron 内置打印引擎，不要求本机安装 TeX，`.doc` 是 RTF 兼容容器。AI 管理还会审计“字符串 / 字符串算法”等语义重复分类，生成可预览、确认和回滚的整理计划。模板元数据则收敛为解决的问题、时间/空间复杂度、标签和用户笔记；“解决的问题”统一描述问题、输入与输出。

当前包未使用 macOS Developer ID/notarization 或 Windows Authenticode 签名；没有自动更新。详见 [发布说明](docs/RELEASE.md) 和 [用户指南](docs/USER_GUIDE.md)。

### macOS 命令安装（Apple Silicon）

```bash
curl -fLO https://github.com/Fingxing2025/algorithm-learning-workbench/releases/download/v0.1.3-rc.4/install-macos-preview.sh
curl -fLO https://github.com/Fingxing2025/algorithm-learning-workbench/releases/download/v0.1.3-rc.4/SHA256SUMS.txt
grep 'install-macos-preview.sh$' SHA256SUMS.txt | shasum -a 256 -c -
sh install-macos-preview.sh
```

脚本只安装并打开已校验的 Preview App；遇到同名 App 会停止，不会覆盖。它不能替代 macOS 正式签名或公证。

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

Windows 候选必须在原生 Windows 主机或 runner 生成；CI 构建不等于实机安装验收。工程、数据、AI、文件计划和发布边界记录在 `docs/decisions/` 中的 ADR-0001 至 ADR-0035。威胁模型见 [安全威胁模型](docs/智能算法学习助手-v2-threat-model.md)，审查结论见 [安全最佳实践审查](docs/SECURITY_REVIEW.md)。
