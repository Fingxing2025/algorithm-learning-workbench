# 安全最佳实践审查

## 执行摘要

审查范围为 Electron + React + TypeScript 运行时代码、文件与密钥边界、Provider 网络层、CI 和打包配置。未发现 Critical 或 High 级已确认代码漏洞。Renderer 使用 React 默认转义，没有 `dangerouslySetInnerHTML`、`innerHTML`、`eval`、动态脚本或直接网络请求；Electron 已启用 sandbox/context isolation 并禁用 Node integration。正式公开发布前的主要阻塞项是 macOS 产物尚未 Developer ID 签名和 notarize；其余发现均需要本地用户主动配置或同账户写权限，评为 Low/Informational。

## Critical

无。

## High

无。

## Medium

### SEC-001：公开发布产物尚未签名和公证

- 规则：发布供应链完整性。
- 位置：`package.json:84-126`（electron-builder 配置）；`.github/workflows/quality.yml:39-65`（平台打包）。
- 证据：macOS 配置启用了 hardened runtime，但没有 Developer ID identity/notarization；本机打包日志确认 `0 valid identities found` 并跳过签名。
- 影响：攻击者可替换来源不明的 DMG/ZIP，用户也会遇到 Gatekeeper 警告，无法可靠验证发布者身份。
- 修复：公开分发前在受保护 CI 环境配置 Developer ID Application、notarization 凭证和 Windows Authenticode；发布流程验证签名并保存校验值/attestation。
- 缓解：当前产物只标记为开发预览，使用 SHA-256 校验，并从受控渠道分发。
- 误报说明：若发布平台在仓库外完成签名，需要保留可审计的签名验证输出；当前本机产物已确认未签名。

## Low

### SEC-002：自定义 HTTPS Provider 可指向私网地址

- 规则：REACT-NET-001 / SSRF 防护。
- 位置：`src/main/services/ai-provider-service.ts:34-70`；`src/main/services/ai-provider-adapters.ts:38-58`。
- 证据：Base URL 强制 HTTPS（Ollama 仅本机 HTTP），但没有阻止 HTTPS 的 loopback、RFC1918 或链路本地解析结果。
- 影响：被社会工程诱导的本地用户可能让应用访问内网服务，或把题面/模板片段发送给错误目标。
- 修复：UI 明确展示最终协议和主机；可增加“阻止私网地址”默认选项，解析 DNS 后同时检查 IPv4/IPv6 私网范围。
- 缓解：地址必须由本地用户手工配置；禁止重定向、敏感自定义头、非 HTTPS，且无公网远程入口。
- 误报说明：允许自托管 Provider 是产品需求，因此不能无条件禁止所有私网地址。

### SEC-003：文件路径授权存在理论 TOCTOU 窗口

- 规则：文件系统授权与竞态安全。
- 位置：`src/main/security/path-guard.ts:27-63`；`src/main/services/template-management-service.ts:261-314`。
- 证据：代码先执行 realpath/lstat 范围检查，随后再通过路径执行 copy/rename/unlink；同账户进程可尝试在两步之间替换目录项。
- 影响：极端并发条件下可能操作与检查时不同的对象，造成模板完整性问题。
- 修复：关键写操作继续使用独占创建/原子 rename；未来可在执行前后核对 inode、device 和哈希，或使用支持目录句柄相对操作的平台原语。
- 缓解：拒绝符号链接、规范化路径、限制授权根、检查目标冲突，撤销前比较哈希。
- 误报说明：利用需要同一 OS 账户的工作区写权限；该攻击者通常已经能直接修改这些模板，因此不构成远程提权。

### SEC-004：仍可撤销的文件计划备份没有自动过期策略

- 规则：敏感数据最小保留。
- 位置：`src/main/services/template-management-service.ts:261-286,478-499`；`docs/decisions/0006-template-intake-and-file-plans.md:28`。
- 证据：应用计划后需要保留源码副本以支持撤销；本轮已修改为撤销成功后尽力立即删除对应备份，但长期未撤销记录仍会保留。
- 影响：应用数据目录或系统备份被读取时，已删除/移动模板可能多留一份副本，并持续占用磁盘。
- 修复：后续提供“清除历史备份”入口和可配置保留期；清理前明确让用户确认将失去撤销能力。
- 缓解：备份目录权限为 `0700`；执行失败和撤销成功都会清理；文件内容不会进入日志。
- 误报说明：立即删除全部备份会破坏核心撤销保证，因此保留必须在可恢复性与最小化之间取舍。

## Informational

### SEC-005：CSP 样式源包含 `unsafe-inline`

- 规则：JS-CSP-002 / REACT-CSP-001。
- 位置：`src/main/security/window-security.ts:5-19`；`src/renderer/index.html:4-10`。
- 证据：`script-src` 严格为 `'self'` 且无 `unsafe-eval`，但 `style-src` 为 `'self' 'unsafe-inline'`，用于 Tailwind/Radix/Motion 运行时样式兼容。
- 影响：若未来出现样式注入，只会削弱 CSS 层防护；当前没有 HTML 注入 sink，无法直接转化为脚本执行。
- 修复：依赖升级或设计系统稳定后评估移除运行时 inline style；脚本策略继续保持严格。
- 缓解：禁用远程内容、任意导航、webview、窗口打开与 Renderer 网络；React 正常 JSX 转义不可信文本。
- 误报说明：Electron 通过响应头再次注入同一 CSP；这里不是缺少 CSP，也没有为脚本启用 `unsafe-inline`。

## 已验证的安全基线

- Renderer 没有原始 IPC、Node、数据库、密钥或网络权限（`src/main/window/create-main-window.ts:15-25`; `src/preload/index.ts:20-78`）。
- 所有 IPC handler 使用 schema 校验，公开错误不回传内部对象（`src/main/ipc/register-validated-handler.ts:15-30`）。
- API Key 由 Electron `safeStorage` 加密；Linux `basic_text` 后端会被拒绝，SQLite 仅保存不可推导密钥的引用（`src/main/security/secret-store.ts:16-34,70-93`）。
- Provider 禁止重定向、限制超时和响应大小，并区分鉴权、模型、限流和网络错误（`src/main/services/ai-provider-adapters.ts:42-93`）。
- AI 题目结果是内存草稿；文件管理结果是受限计划，用户确认前不写入数据或修改模板（`src/main/services/problem-analysis-service.ts:91-141`; `src/main/services/template-management-service.ts:190-230`）。
- 锁文件已提交，CI 使用最小只读权限、`npm ci` 并执行 `npm audit --audit-level=moderate`（`.github/workflows/quality.yml:8-24`）。
