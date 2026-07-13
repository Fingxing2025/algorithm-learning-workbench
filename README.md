# 智能算法学习助手 V2

面向所有算法学习者的本地优先桌面工作台。用户可以从空白工作区开始建立自己的模板、题目、关联关系和多供应商 AI 配置。

## 当前状态

阶段 1 模板库纵向切片已经完成：应用可从全新数据目录启动，创建或选择模板工作区，只读扫描源码，使用折叠模板树和全局搜索打开算法卡片，并以不覆盖方式创建第一份模板。下一步是阶段 2 的题目卡片与模板多对多关联。

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
4. 在第一个实现任务中确认包管理器、Electron 脚手架和数据库驱动，并记录选择理由。

## 本地开发

要求 Node.js 24。`better-sqlite3` 是原生依赖，首次安装依赖以及升级 Electron 后，需要针对当前 Electron ABI 重建：

```bash
npm install
npm run rebuild:native
npm run dev
npm run check
npm run test:e2e
```

工程与模板工作区决策分别记录在 `docs/decisions/0001-stage-0-foundation.md` 和 `docs/decisions/0002-template-workspace-and-scan.md`。
