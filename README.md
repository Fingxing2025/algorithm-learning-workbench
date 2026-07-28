# 智能算法学习助手 V2

面向所有算法学习者的本地优先桌面工作台。用户可以从空白工作区开始建立自己的模板、题目、关联关系和多供应商 AI 配置。

## 当前状态

V2 `0.1.3` RC1 已进入候选验证：从全新应用数据目录开始，用户可以创建可直接复制的自包含工作区，在当前工作区内管理模板、题目和多对多关系，配置五类 AI 协议及 DeepSeek/阿里云百炼快捷预设，并通过可预览、可撤销的计划整理整个模板库。

`0.1.3` RC1 源码门禁已通过：49 个 Vitest 文件/375 项、8 项发布脚本测试和 57 项常规 Electron E2E 全部通过。macOS arm64 与 Windows x64 Preview 均已在原生平台生成，架构、版本、SHA-256、SBOM、隐私检查和各平台 packaged smoke 2/2 通过。核心产品流程、当前工作区深拷贝备份恢复、五协议 AI 稳定性和大型工作区性能已闭环，公开发布仍被 macOS 签名/公证与 Windows Authenticode 阻塞。完整进度和风险见 [项目状态与交接](docs/PROJECT_STATUS_AND_HANDOFF.md)。

macOS arm64 与 Windows x64 已建立可重复候选流程：精确选择当前版本产物，生成 SHA-256、CycloneDX SBOM、构建元数据、隐私报告和发布说明草稿。当前没有 Developer ID/notarization 凭据，macOS 只能作为开发预览；Windows `0.1.3` RC1 安装器已生成并通过 CI 打包态验证，但未签名，且尚未产生该候选的真实安装/升级/卸载与跨平台备份往返证据。详见 [发布说明](docs/RELEASE.md) 和 [用户指南](docs/USER_GUIDE.md)。

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
