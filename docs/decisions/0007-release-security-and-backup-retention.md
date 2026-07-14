# ADR-0007：发布安全与文件计划备份保留

- 状态：接受
- 日期：2026-07-14
- 范围：阶段 6

## 背景

阶段 6 需要把真实 Electron 应用打包为 macOS 与 Windows 产物，同时明确 AI 文件计划备份的保留周期。安装包包含可访问文件系统、SQLite、系统安全存储和网络的 Main 进程，发布链完整性与本地敏感副本管理都属于安全边界。

## 决定

1. 使用 electron-builder 生成 macOS DMG/ZIP 与 Windows x64 NSIS，启用 ASAR 并只解包 `better-sqlite3` 原生模块。
2. CI 使用 Node 24、`npm ci`、依赖审计、静态检查、单元测试、macOS Electron E2E 和双平台打包；Windows 构建不能替代真实 Windows 安装验收。
3. macOS 开启 hardened runtime，但没有 Developer ID 时产物必须明确标记为未签名开发预览；公开发布必须完成代码签名与 notarization。Windows 正式发布同样需要 Authenticode。
4. 已应用但仍可撤销的文件计划保留备份；执行失败或撤销成功后立即尽力删除对应备份。不能在用户仍需要撤销能力时静默清理。
5. 应用不实现旧版数据迁移。打包 smoke test 使用全新 userData 验证从零启动和 Renderer 权限边界。
6. 威胁模型和安全审查作为版本库文档维护；新增云同步、自动更新、多用户或社区内容时必须重做相关边界。

## 后果

- 发布产物约 130 MiB，换取统一 Chromium 运行时和原生 SQLite 能力。
- 未签名预览会触发系统警告，不能宣称为可无提示公开分发的正式版本。
- 保留可撤销备份会占用磁盘并复制模板内容；后续应提供用户可控的历史备份清理和保留期设置。
- CI 能尽早暴露跨平台构建问题，但最终 Windows 质量声明仍需真实 Windows 主机证据。
