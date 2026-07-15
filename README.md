# 智能算法学习助手 V2

面向所有算法学习者的本地优先桌面工作台。用户可以从空白工作区开始建立自己的模板、题目、关联关系和多供应商 AI 配置。

## 当前状态

V2 `0.1.2` 开发快照的阶段 0–6 与首轮质量迭代已完成：从全新应用数据目录开始，用户可以建立模板工作区、题目卡片和多对多关联，配置五类 AI 协议及 DeepSeek/阿里云百炼快捷预设，确认题目 AI 草稿，并通过可预览、可撤销的计划整理整个模板库。

当前质量基线为 43 项 Vitest 和 22 项常规 Electron E2E 通过；打包入口另有独立 smoke test。核心产品流程已闭环，公开发布仍需完成 V2 数据导出/恢复、macOS 签名与公证，以及真实 Windows 安装验收。完整进度、风险和多 Session 分工见 [项目状态与交接](docs/PROJECT_STATUS_AND_HANDOFF.md)。

macOS arm64 DMG/ZIP 已完成本机打包和真实入口验证，但当前没有 Developer ID 签名或 notarization，只作为开发预览。Windows NSIS 已配置 CI 构建，尚未完成真实 Windows 主机安装验收。详见 [发布说明](docs/RELEASE.md) 和 [用户指南](docs/USER_GUIDE.md)。

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

## 打包

```bash
npm run dist:mac
npm run dist:win
```

工程、模板工作区、题目关联、AI Provider、题目草稿、文件计划、删除与计划重建等边界记录在 `docs/decisions/` 中的 ADR-0001 至 ADR-0010。威胁模型见 [安全威胁模型](docs/智能算法学习助手-v2-threat-model.md)，审查结论见 [安全最佳实践审查](docs/SECURITY_REVIEW.md)。
