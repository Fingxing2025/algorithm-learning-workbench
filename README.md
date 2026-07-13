# 智能算法学习助手 V2

面向所有算法学习者的本地优先桌面工作台。用户可以从空白工作区开始建立自己的模板、题目、关联关系和多供应商 AI 配置。

## 当前状态

阶段 0 工程基线已经完成：Electron、React、TypeScript、设计 token、安全 Preload API、单元测试、Electron E2E 和 CI 均已建立。下一步是阶段 1 的首次启动、模板目录只读扫描、模板树与算法卡片纵向切片。

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

要求 Node.js 24。依赖安装后可使用：

```bash
npm run dev
npm run check
npm run test:e2e
```

阶段 0 的工具链选择记录在 `docs/decisions/0001-stage-0-foundation.md`。
