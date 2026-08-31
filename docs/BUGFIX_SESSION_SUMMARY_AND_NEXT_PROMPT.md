# Bugfix Session 总结与下一 Session 提示词

- 完成日期：2026-07-18
- 实际起始基线：`de685da feat: harden ai task reliability matrix`
- 结束基线：本文所在提交
- 分支：`main`
- 发布方式：仅本地提交，没有推送远程仓库
- 最新测试 App：`/Users/ffxx/Desktop/项目/智能算法学习助手-v2/release/mac-arm64/算法学习工作台.app`

## 本次结论

用户确认的九项问题已经全部完成，并从真实 Electron 桌面入口通过回归。Session A 的数据诊断、备份、恢复、中断恢复、隔离和废纸篓移交能力，以及 Session B 的 AI 取消、有限重试、五协议兼容、错误分类和日志脱敏能力均未回退。

1. 新建模板关闭按钮统一为 44×44，视觉区域、中心、背景和四角命中一致。
2. 模板树新工作区默认全部折叠，手动展开状态按工作区保存，切页和重启恢复；搜索临时展开不污染常规状态。
3. “新建题目”和“AI 分析题目”合并为一个窗口，手动字段、图片、AI 结果和多模板关系使用同一内存草稿。
4. 数据管理“模板”统计统一为当前活动工作区实际可用模板，不再混入其他工作区或不可用历史索引。
5. 工作区入口统一为明确文案“切换工作区”，系统目录选择取消时保留原工作区。
6. 模板支持预览后安全重命名或移动真实文件，保持模板 ID、元数据和题目关系；执行前备份，故障时补偿回滚。
7. 文件计划历史改为内部滚动区；单条和批量删除采用二次确认后的软归档，执行记录、撤销备份和用户文件保持不变。
8. App 图标复用现有白色立方体，改为青—蓝—紫—粉渐变；源 PNG 与打包 `icon.icns` 四角透明且没有白色画布。
9. 题目 AI 会从当前工作区安全检索多份不同方向的本地模板；伪造 ID 被过滤、重复候选确定性去重、低置信度候选默认不勾选，最终只保存用户确认的关系。

## 关键架构与数据变化

- 新增 ADR：`docs/decisions/0017-bugfix-workflows-and-local-template-retrieval.md`。
- 新增 migration：`drizzle/0005_bugfix_workflows.sql`，只为 `file_change_plans` 增加可空 `archived_at`。
- 模板移动和计划归档通过 Main、Zod、命名 IPC 与 Preload 白名单完成；Renderer 没有新增系统权限。
- 模板移动备份继续使用 `userData/file-plan-backups/`；软归档不会物理删除计划、执行历史或撤销备份。
- 题目候选作用新增草稿层分类：直接解法、子问题、前置能力、优化方向、替代解法；数据库关系类型仍为 `used/recommended/alternative`。
- 本地模板上下文最多 24 份、源码片段合计最多 30,000 字符，最终关联草稿最多 8 份；不发送用户笔记、API Key、绝对路径或完整模板库。
- 模板树偏好只使用 workspace UUID 和相对目录 ID，保存在本机 `localStorage`，不进入数据库或备份。

## 最终验证证据

- `npm run check`：通过。
- TypeScript、ESLint、Prettier：通过。
- Vitest：25 个文件，187 项通过。
- `npm run test:e2e`：43 项通过，1 项打包入口测试按条件跳过。
- 打包入口 smoke：使用全新 userData 单独执行，1 项通过。
- macOS arm64 `npm run package:dir`：通过；应用二进制为 Mach-O arm64。
- 图标：源 PNG 和打包 `icon.icns` 的 1024 层四角均为 `(0,0,0,0)`，alpha 主体边界为 `(48,48)–(976,976)`。
- 截图：统一题目手动模式、AI 多候选模式、文件计划滚动与删除确认均覆盖 1280×720、1440×900 和亮暗主题，并完成人工复核。
- Finder 与打包 App 启动外观已人工核对；图标没有外围白底，App 可从真实打包入口启动。
- 打包资源隐私扫描未发现测试密钥、个人绝对路径、SQLite、日志或 secrets 文件；验收截图只使用合成夹具。

## 兼容与限制

- 全新 userData：可以启动并完成首次工作区设置。
- 空白工作区：可以新建第一份模板和纯手工题目，不要求配置 AI。
- 已有 V2 数据：通过增量 migration 原位升级，不删除数据库；模板、题目、图片、关系、Provider 非密钥配置和文件计划历史保持。
- 异常中断：Session A 的恢复与清理 journal、事务标记和隔离回滚 E2E 全部通过。
- 旧项目 `../智能算法学习助手`：未修改，也不是 V2 的运行依赖。
- `.codex/config.toml`：未修改、未暂存、未提交。
- `问题反馈.txt`：保持未跟踪，未暂存、未提交。
- 当前 macOS App 是 ad-hoc 未签名开发预览，尚未 notarize；Windows 仍没有实机安装、升级和卸载证据。

## 推荐下一步

下一主线建议执行 Session C：发布工程与平台验收。它不再增加产品页面，重点把当前开发预览推进为可验证的发布候选。若暂时没有 Apple Developer ID、notarization 凭据或 Windows 实机，应完成不依赖凭据的发布清单、版本事实源、校验和和自动化准备，并把外部条件明确记录为阻塞；不得把未执行的平台步骤写成通过。

## 可直接复制的下一 Session 提示词

```text
继续开发“智能算法学习助手 V2”。

工作目录：
/Users/ffxx/Desktop/项目/智能算法学习助手-v2

本 Session：
Session C：发布工程与平台验收

开始前必须：
1. 完整阅读 AGENTS.md、docs/PROJECT_STATUS_AND_HANDOFF.md、docs/BUGFIX_SESSION_SUMMARY_AND_NEXT_PROMPT.md、docs/RELEASE.md、docs/QUALITY_GATES.md、docs/SECURITY_REVIEW.md 和 docs/智能算法学习助手-v2-threat-model.md。
2. 执行 git status、git log -5 --oneline；以当前 HEAD 为基线，不回退已完成的 Session A、Session B 和九项 Bugfix Session。
3. .codex/config.toml 与 问题反馈.txt 是受保护文件，不得覆盖、回滚、格式化、暂存或提交。
4. 旧项目 ../智能算法学习助手 仅可只读参考，不得修改，不做旧版迁移。
5. 先审计现有 package.json、electron-builder 配置、release 文档、CI 和当前 macOS arm64 产物，再更新发布决策；不要先重做产品 UI。
6. 涉及自动更新、签名身份、notarization、安装权限、升级/卸载或发布渠道时，先新增或更新 ADR。
7. 使用小而完整的本地提交，不推送远程仓库。

目标：
把当前 ad-hoc macOS arm64 开发预览推进为可重复、可审计的发布候选流程，并为 Windows 实机验收建立同一套发布事实来源。

实施顺序：
第一切片：发布事实与只读审计
- 核对版本号、productName、appId、目标架构、原生 better-sqlite3 ABI、图标、entitlements、hardened runtime、签名和 notarization 现状。
- 核对 release/、README、CHANGELOG、用户指南和发布文档是否存在版本或测试数字冲突。
- 记录当前没有 Developer ID、notarization 凭据或 Windows 实机时能完成与不能完成的边界。

第二切片：可重复发布产物
- 建立一次命令生成同一版本的 macOS 目录包、DMG/ZIP、SHA-256、构建元数据和发布说明草稿。
- 明确 release/ 仍被 Git 忽略，安装包不得包含 userData、SQLite、secrets、模板源码、题目、图片、用户笔记或个人绝对路径。
- 如增加 SBOM、依赖清单或 attestation，使用独立、可审查的生成步骤，不引入不必要的运行时依赖。

第三切片：macOS 发布验收
- 如果具备有效 Developer ID 和 notarization 凭据：完成 codesign、hardened runtime、notarytool、stapling、spctl 与 Gatekeeper 验证，并保存同一候选的证据。
- 如果缺少凭据：不得伪造通过；完成 unsigned/ad-hoc 候选的可执行检查，列出需要用户提供的最小外部条件。
- 使用全新 userData 和已有 V2 userData 各运行一次真实打包入口 smoke；验证升级不删除数据。

第四切片：Windows 验收
- 不把 CI 交叉构建或 macOS 产物当作 Windows 实机通过。
- 在真实 Windows 主机验证 NSIS 安装、首次启动、已有 V2 数据升级、快捷方式、文件权限、卸载后用户数据保留策略和 Authenticode 状态。
- 如果当前没有 Windows 实机，准备可执行的验收脚本和清单，并明确记录“未验证”，不要宣称完成。

最低验收：
1. npm run check 通过。
2. 完整 npm run test:e2e 通过；packaged smoke 单独通过。
3. macOS arm64 package:dir 与发布产物命令可重复执行。
4. 产物架构、版本、图标、Info.plist、原生模块 ABI 和 SHA-256 来自同一次构建。
5. 全新 userData 与已有 V2 数据均从真实打包入口启动。
6. 隐私扫描证明产物不含用户数据、密钥、个人目录或测试私密正文。
7. macOS 签名/公证和 Windows 实机状态必须如实报告；缺少外部条件时明确阻塞，不做虚假通过。

交付要求：
1. 更新 docs/PROJECT_STATUS_AND_HANDOFF.md、docs/RELEASE.md；如改变发布架构则新增 ADR。
2. 报告基线提交、结束提交、未提交文件和全部本地提交，不推送。
3. 列出产物绝对路径、架构、大小、SHA-256、签名/公证状态和 packaged smoke 结果。
4. 分别报告全新 userData、已有 V2 数据、macOS 和 Windows 的兼容结论。
5. 明确列出需要用户提供的证书、凭据、账号或硬件条件；不要要求用户在聊天中发送私钥或密码。
6. 明确 .codex/config.toml 与 问题反馈.txt 已排除。
```
