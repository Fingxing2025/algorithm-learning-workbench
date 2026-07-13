# ADR-0001：阶段 0 工程基线

- 状态：已接受
- 日期：2026-07-14

## 背景

V2 需要同时构建 Electron main、preload 和 React renderer，并在第一阶段建立可测试的进程边界、可复现依赖和设计系统。当前仓库只有产品与架构文档，没有历史工程兼容负担。

## 决定

1. 使用 npm 和 `package-lock.json`。项目要求 Node.js 24，CI 使用 `npm ci`。
2. 使用 Electron 43 与 electron-vite 5 组织 main、preload、renderer 三个构建目标。
3. electron-vite 5 当前 peer dependency 只覆盖 Vite 5 至 7，因此固定 Vite 7；不强行安装 Vite 8。
4. 使用 React 19、TypeScript 6。TypeScript 7 超出当前 typescript-eslint 8 的兼容范围，因此暂不采用。
5. 使用 Tailwind CSS 4、Radix UI、Lucide 和 Motion 建立项目自己的设计 token 与组件，不直接交付组件库默认主题。
6. Preload 只暴露 `window.desktop` 下经过类型定义的窄接口。IPC channel 集中声明，输入与输出边界使用 Zod 校验；不向 Renderer 暴露 `ipcRenderer`。
7. BrowserWindow 默认启用 `contextIsolation`、sandbox 和 webSecurity，关闭 Node integration、webview 和任意新窗口；Renderer 使用 CSP 且不承载密钥或 Provider 网络调用。
8. SQLite 采用 Drizzle ORM + `better-sqlite3`，但在阶段 1 首次定义 schema 时安装。`better-sqlite3` 是原生依赖，届时必须补 Electron ABI rebuild 与打包验证，避免阶段 0 无数据模型时提前承担原生构建成本。
9. 阶段 0 使用 Vitest + React Testing Library 做单元测试，使用 Playwright Electron API 做真实桌面 E2E 和截图验收。

## 备选方案

- Electron Forge：官方集成完整，但当前纵向切片不需要 Forge 的生成器和发布插件；electron-vite 的三进程开发体验更直接。
- Vite 8：当前与 electron-vite 5 的 peer 范围不兼容，待上游声明支持后再评估。
- TypeScript 7：当前与 typescript-eslint 8 不兼容，升级收益不足以抵消工具链冲突。
- `node:sqlite`：减少第三方原生依赖，但 Drizzle 生态与 Electron 打包验证路径不如 `better-sqlite3` 成熟。

## 后果

- 阶段 0 不引入数据库文件，也不会访问旧项目。
- 依赖版本由 lockfile 固定；核心构建依赖升级时必须同时检查 peer dependency。
- 阶段 1 引入 SQLite 时需要新增数据库 ADR 或扩展本记录，说明 migration、备份及原生模块打包策略。
