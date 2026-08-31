# 质量门禁

## 基础门禁

- TypeScript 无错误。
- ESLint 无新增错误。
- 格式检查通过。
- 单元测试通过。
- 受影响的 Playwright E2E 通过。
- Electron 可以从开发入口真实启动。

当前累计基线（2026-07-23，完整工作区 AI 模板目录源码提交 `720fca6`）：39 个 Vitest 文件中的 259 项测试与 7 项发布脚本测试通过；常规真实 Electron E2E 57 项通过，2 项 packaged 测试在未设置 `PACKAGED_APP_PATH` 时按条件跳过。该 Session 以 `95a7795` 为并发 Windows 发布工作结束后的实际基座，没有改动发布脚本、依赖或平台证据，也没有重新打包。测试数量随功能增长会变化，发布判断以当次命令结果为准。

## 核心 E2E 场景

1. 使用全新应用数据目录首次启动，创建空白模板工作区并完成第一个模板入库。
2. 选择已有模板目录，只读显示数量与异常但不修改文件。
3. 搜索模板并从结果定位到折叠后的树节点。
4. 打开算法卡片、复制代码、编辑允许修改的元数据。
5. 新建题目卡片并关联多个模板。
6. 上传题目截图，AI 返回草稿，用户确认后保存题目和关联。
7. 添加自定义 AI Provider，测试连接并选择任务模型。
8. AI 生成文件整理计划，预览后取消时文件不发生变化。
9. 确认一项文件变更，数据库与文件系统保持一致。
10. 断网或供应商失败时，模板查询和题目浏览仍可用。
11. 批量选择或扫描 `.cpp` 后默认全选并可逐份取消；没有 AI 元数据也能按可编辑路径导入。目标冲突逐项支持跳过、改名或明确覆盖；覆盖前备份，任一步失败整批恢复，外部源文件始终不变。
12. 644 份模板、126 道题、110 条单模板关系及 105 条计划/执行记录通过真实 IPC 键集分页完整遍历，无重复、无静默 100 条截断；搜索可定位首批之外模板。
13. 增量扫描覆盖无变化、mtime 恢复后的同长度改写、移动、删除、符号链接、中途变化和用户取消；取消后 SQLite 统计与用户源码保持不变。

## UI 验收

- 亮色与深色主题。
- 1024×640、1280×720、1440×900、200% 缩放和高分屏窗口。
- 默认、加载、空、错误、离线和禁用状态。
- 键盘可完成全局搜索、模板选择、题目创建/关联、文件计划确认、树/菜单/历史列表导航和关闭对话框。
- 可调整面板必须覆盖鼠标拖动、方向键、Shift 加速、Home/End、Enter/Space/双击重置、重启恢复、异常值回退和全局重置。
- 对话框打开后焦点进入有效首项，关闭后回到触发器；异步焦点恢复不得覆盖用户新选择的控件。
- 关闭按钮的 `X` SVG 不得截获鼠标；自动化必须从 `X` 笔画中心执行真实鼠标点击，并确认命中元素是按钮、浮层退出且焦点返回触发器。
- 页面切换、成功、失败、AI 取消、计划完成和恢复结果必须使用不泄露正文的 `status` / `alert` / `aria-live` 播报。
- 焦点可见，对比度可读，功能反馈不只依赖颜色；减少动效设置关闭非必要位移和缩放。
- 长工作区名、长相对路径、长标题、连续长题面、超多标签和大量列表不能造成 document 横向溢出或不可达主操作。
- 对核心页面保留基线截图；视觉变化必须有意图说明。

### Session D 自动化与截图证据

- `tests/e2e/accessibility-layout.spec.ts` 7 项通过：鼠标/键盘 resize、安全边界、真实重启恢复、异常值回退、重置、焦点回归、页面播报、长内容全键盘流程、真实 1024×640、200% 主操作在视口内和减少动效。
- `tests/e2e/scroll-and-code-viewer.spec.ts` 验证 48 个虚拟目录使用 End/Home 在模板树内部滚动；36 个题目的列表、长题面详情和编辑字段区分别使用真实鼠标滚轮与滚动条拖动，面板不得按内容高度撑开后被外层裁切。
- `tests/e2e/file-management.spec.ts` 验证键盘聚焦并确认计划、取消生成零写入、外部修改整批拒绝、执行/备份/关系稳定与回滚。
- `tests/e2e/app.spec.ts` 使用真实 600×4000 PNG 验证长图默认按宽度滚动到底、整图概览、200% 工具栏可达和 Escape 焦点回归。
- `tests/e2e/app.spec.ts` 直接点击新建模板、新建题目和长图预览的 `X` 图标中心；滚动 E2E 同样点击编辑题目的 `X` 中心，验证 `elementFromPoint` 命中按钮、pointer 光标、退出成功和焦点回归。
- `tests/e2e/template-intake.spec.ts` 额外要求新建模板卡片和遮罩计算为 `-webkit-app-region: no-drag`，并分别在刚打开、切换“补全语言”后从 `X` 图标中心关闭。定向 packaged 回归覆盖同一契约；真实 macOS 鼠标验收必须使用隔离 bundle ID，避免同名旧进程造成误判。
- `tests/e2e/problem-analysis.spec.ts` 7 项通过：AI 发送预览空闲时点击 `X`、按 Escape，以及生成中点击 `X` 均退出整张题目卡片；题目主 `X` 与预览 `X` 在忙碌状态均断言为 enabled，生成中退出会关闭本地 mock 连接且零题目写入，“取消生成”仍保留草稿。
- `tests/e2e/file-management.spec.ts` 另验证未撤销执行不可删除、混合批次整批拒绝、单条/批量确认焦点，以及删除后数据管理执行记录计数从 1 同步为 0。
- 最终截图目录：`/Users/ffxx/Desktop/项目/智能算法学习助手-v2/output/playwright/session-d-final/`。
- 必须人工复核四页面 1440×900、1280×720、1024×640 的亮暗主题以及 200% 关键状态；联系图只能辅助浏览，不能替代原始截图。
- 当前屏幕阅读器限制：已有语义树、accessible name、键盘和 live region 自动化；macOS VoiceOver 长流程真人审计、Windows Narrator 与高对比模式仍未完成，不能宣称跨平台辅助技术完全通过。

### Session E 性能门禁

- 基准必须通过 `npm run benchmark:performance` 单命令生成 1k/5k/10k 临时夹具；每项至少 3 次，正式报告使用 5 次并记录 P50/P95 与 RSS。输出不得含源码、题面、绝对路径、API Key 或 Provider 正文。
- 无变化重扫必须证明 `hashedCount = 0` 且 `reusedCount = unchangedCount = templateCount`；强制完整重扫结果与增量公开结果确定性一致。
- 内容变化但 mtime 恢复、唯一移动、删除、符号链接、读取失败/中途变化和取消必须有自动化证据；任何失败不得发布半完成索引。
- 模板/题目/历史分页必须使用 Main 校验的不透明键集游标；Renderer 不得提交 OFFSET、SQL 或任意排序字段。
- 仍存在的上限必须显示已处理数、总数/未知、截断原因和下一步。大题目列表保留 Arrow、Home/End、Enter/Space；小工作区原生滚动条回归继续通过。
- UI 截图至少覆盖大型模板首批/搜索、题目分页的 1440×900、1024×640、亮暗主题和减少动效；既有 Session D 1280×720、200% 与全页面矩阵继续作为回归证据。

## 安全验收

- Renderer 无 Node 权限，不存在原始 IPC 暴露。
- IPC 参数经过 schema 校验，文件路径经过授权根目录校验。
- API Key 不出现在数据库、日志、错误信息、测试快照和截图中。
- Renderer 不接收已保存 API Key 或密文，只接收 `hasSecret`；连接测试只发送固定探测提示。
- 外链和自定义 API 地址经过协议校验。
- 除本机 Ollama 外，Provider 使用 HTTPS；自定义请求头不能覆盖鉴权或传输敏感头。
- 删除、覆盖、批量移动和 AI 文件计划需要明确确认。
- 文件计划执行前创建应用内备份；撤销前检查路径占用和执行后的外部修改，禁止覆盖后续用户数据。

## 全新安装与数据升级验收

- 不存在旧项目、旧数据库或预置模板时，应用可以正常启动并完成首次设置。
- 空白模板工作区具有可操作的空状态，用户可以手动创建第一份模板和题目。
- 选择已有目录不会自动重命名、移动、覆盖或删除其中的文件。
- 安装包和默认应用数据不包含开发者的个人路径、模板、题目、Provider 或密钥。
- V2 schema migration 有升级测试和必要的回滚/备份策略，不依赖删除数据库重新生成。

## 跨平台备份门禁

- 正常“备份与恢复”页只展示当前工作区的数据状态、工作区备份和恢复备份；不得恢复保留策略、容量仪表、治理候选、新建隔离入口、SQLite/WAL 或内部 issue code。
- 备份选择必须自动校验；恢复前必须显示“来源工作区 → 当前目标工作区”、6 类“目标当前/备份”数量、深拷贝只替换当前工作区的警告与显式确认，不得要求选择父目录。
- 无当前 v2 恢复中断记录时不渲染中断面板；有记录时必须重新验证并显式确认。旧隔离数据不暴露 Renderer、Preload 或 IPC 兼容入口。
- 组件测试锁定正常页最小功能集、精确导出/恢复请求和当前 v2 中断流程；不再为旧隔离治理造测试入口。
- 截图至少覆盖 1440×900、1280×720、1024×640 亮暗正常态，以及恢复对比和当前 v2 中断恢复状态；需人工检查滚动、对比表、聚焦可见性和亮暗层级。
- 外部导出必须生成真正的单文件 `.awb-backup v2` ZIP；v1 目录包、缺少源码的 v2 包和多工作区包只读拒绝。
- ZIP entry 必须使用 UTF-8/EFS、`/` 和 NFC；拒绝 Zip Slip、符号链接、清单外文件、重复路径、Windows 保留名/非法字符、NFC/大小写碰撞和异常展开规模。
- 模板源码按原始字节保存，macOS/Windows 往返 SHA-256 一致；不自动添加 BOM、转换 GBK/CP936、改换行或静默重命名。
- 导出必须强制包含当前工作区的一条 workspace 记录、完整模板源码与相对路径、模板元数据、题目/图片/关联、计划/执行及精确文件清单；其他工作区、Provider/路由和无归属批量备份不得进入包，过滤后的 SQLite 必须压实以清除空闲页残留。
- 恢复目标必须始终是执行时的当前工作区；来源工作区即使仍已登记也不得阻止恢复。当前
  目标保留自己的 ID/名称/路径，来源与其他工作区及 Provider 配置保持不变。模板、题目、
  图片、计划、执行主键，以及计划/执行 JSON、题目图片目录和执行备份目录必须一致重映射，
  源码按相对路径原地替换当前工作区的受管模板树。
- v2 manifest 必须只有一个工作区且与 SQLite 一致；旧多工作区包允许完成完整性验证，但必须拒绝恢复并给出可操作提示。
- macOS 与 Windows 原生 CI runner 均配置运行 `tests/e2e/data-management.spec.ts`，覆盖 v2
  导出、篡改拒绝、预备份、当前工作区原地恢复、工作区重映射和失败回滚。CI 证据不能
  替代真实 Windows 物理机的双向传输验收。
- 实机闭环顺序固定为：macOS 导出 -> Windows 校验/恢复/重启读取 -> Windows 再导出 -> macOS 校验/恢复/重启读取；每一段记录 package ID、文件数、SQLite 检查和源码 SHA-256，不记录题面、源码正文、密钥或不必要的绝对路径。
- 中文源码读取必须覆盖 UTF-8、UTF-8 BOM、UTF-16LE/BE BOM 与 GB18030/GBK/CP936；无效字节、NUL 和二进制控制字符失败关闭。查看、复制、扫描索引、相似度审计和 AI 片段不得出现解码替换字符。
- 已有 GB18030/GBK/CP936 与 BOM 文件编辑后保持原编码；外部导入源文件字节不变，新工作区副本统一 UTF-8。便携备份继续用 SHA-256 证明源码未因文本支持而转码。
- 本轮本地门禁：`npm run check` 为 43 个 Vitest 文件/322 项与 8 项发布脚本测试；单次完整 Electron E2E 为 58 项通过、2 项 packaged 条件跳过；另对当前 macOS arm64 测试 `.app` 运行 packaged smoke 2/2。恢复位置界面已人工复核亮色 1440×900 与深色 1280×720。

### 备份与恢复精简实测（2026-07-24）

- `npm run check`：43 个 Vitest 文件/322 项、8 项发布脚本测试，TypeScript、ESLint 0 warnings 与 Prettier 全部通过。
- 定向 Renderer：3 个文件/14 项通过，其中数据页 6 项锁定正常页最小功能集、自动校验/完整对比、精确恢复参数、条件中断与存量隔离兼容。
- 相关真实 Electron E2E：`data-management.spec.ts` + `data-management-count.spec.ts` 9/9，`accessibility-layout.spec.ts` + `file-management.spec.ts` 11/11；正常页 1024×640 与存量隔离截图定向重跑 2/2。首次沙箱内 Electron 因 GUI/本地端口 `EPERM` 失败，授权环境重跑后通过，不计为应用失败。
- 重新生成正常页 1440×900、1280×720、1024×640 亮暗截图，以及恢复对比、中断处理和历史隔离兼容的亮暗截图。代表性尺寸已人工复核并确认无横向溢出、主操作可达、对比表/警告层级清晰。
- 本切片没有新增数据库字段、migration、IPC/Preload、备份格式、回滚协议、权限或依赖。全新 userData 正常页为空白数据健康态；已有 V2 中断/隔离记录仍有兼容处理入口。

### 当前工作区数据边界门禁（2026-07-24）

- 契约必须拒绝空选择、重复/非 UUID、`confirmed: false`、分页越界和不一致预览；Renderer 不得取得备份路径、绝对路径或数据库条件。
- 共享检测必须在当前工作区内覆盖 canonical missing、有效目录、`rolled-back`、格式异常、符号链接、非目录、不可读状态与损坏 `operations_json`。只有 canonical missing 为可清理，其余异常失败关闭。
- 预览为 Main 内存 10 分钟 TTL 且一次性消费。确认前重新验证全部数据库事实与文件状态；任一备份重现或记录变化都整批拒绝。Repository 在单事务内再次比对并删除，父计划保留。
- Renderer 必须覆盖切换工作区后清空旧题目/搜索快照、默认不选、预览/确认焦点、取消回焦、成功/失败 live region、普通历史撤销阻断和数据状态只导航不删除。
- 真实 Electron 必须证明：工作区 A 的失效记录在活动工作区 B 不可见，切回 A 后才可处理；现存有效备份不进入列表；预览后备份重建会拒绝确认；成功后 A 健康问题消失，A/B 源码 SHA-256、父计划和有效备份不变。
- 真实 Electron 还必须覆盖 A/B 题目、图片、关联、首页、Cmd/Ctrl+K 搜索和诊断计数隔离；从 A 导出后在 B 打开时恢复，必须保持 B 的 ID/名称、深拷贝 A 的相对路径与全部数据、重映射冲突 ID，并证明随后修改 B 不影响 A，Provider 与其他工作区不变。
- 本轮最终源码门禁：`npm run check` 通过 TypeScript、ESLint 0 warnings、Prettier、44 个 Vitest 文件/338 项和 8 项发布脚本测试；最终单次完整真实 Electron E2E 为 60 项通过、2 项 packaged 条件跳过，随后当前 macOS arm64 测试 `.app` 的 packaged smoke 2/2 通过。首次沙箱内 Electron 与 electron-builder 用户缓存访问因 `EPERM` 失败，授权环境重跑后通过，不计为应用失败。
- 截图已覆盖失效列表 1440×900 亮色、1280×720 深色、1024×640、选择确认和成功态，以及当前工作区备份亮暗正常态和恢复对比；代表性原图已人工检查，主操作、内部滚动、长工作区名、焦点可见，无横向溢出。
- 测试 App 位于 `release/mac-arm64/算法学习工作台.app`：主程序和 `better-sqlite3` 均为 arm64，版本 0.1.2，签名为 ad-hoc、无 TeamIdentifier、未公证；Windows 原生 CI 本轮与真实 Windows 实机仍未执行。

### 通用深拷贝恢复门禁（2026-07-26）

- 新 v2 导出请求的 `includeTemplateSources` 只能为 `true`；manifest/源码计数、ZIP 清单、SHA-256、SQLite、单工作区作用域和完整源码任一不一致都失败关闭。普通页面不得再次出现省略源码开关。
- 预览必须明确显示来源与当前目标；确认请求绑定预览时的来源/目标工作区 ID。Main 必须重新解析当前工作区和备份快照，来源身份不得决定目标，来源仍登记或全局主键碰撞不得阻止安全重映射。
- A→B 恢复必须保留 B 的工作区 ID/名称/文件夹路径；模板、题目、图片、计划、执行 ID
  以及所有外键、JSON 和目录引用一致重映射。B 原有受管模板、题目图片和执行备份随替换
  移除并进入恢复前预备份，未受管文件冲突时失败关闭；A 与其他工作区不修改。
- 真实 Electron 必须验证恢复后的模板相对路径、GBK 原始字节、模板元数据、题目字段、图片内容、关系、计划/执行数量与引用等价；修改 B 的恢复文件后 A 哈希不变，A 的撤销备份目录继续存在，B 的新执行备份可用。
- `npm run check` 通过 TypeScript、ESLint 0 warnings、Prettier、48 个 Vitest 文件/371 项和 8 项发布脚本测试；数据管理 Electron E2E 8/8，工作区边界 E2E 1/1，packaged smoke 2/2 通过。恢复预览 1440×900 亮色和 1280×720 深色截图已人工检查，无横向溢出，来源/目标/数量层级清晰。
- 全树 Electron 本轮结果为 57 项通过、2 项 packaged 条件跳过、1 项失败、3 项因串行文件提前失败未运行。失败项是既有总体文件 AI 测试仍期望“两次无效响应必然失败”，而当前自适应分批会继续生成可审查计划；该问题可在未进入备份页面时独立复现，未修改其并行工作树实现或测试。
- 当前 `release/mac-arm64/算法学习工作台.app` 已于 2026-07-26 重建，应用和 `better-sqlite3` 均为 arm64、版本 0.1.2；它是 ad-hoc/linker-signed、无 TeamIdentifier、未公证的测试 App。没有数据库 migration、新依赖或新系统权限；恢复 IPC/Zod 契约已升级。旧的省略源码 v2 包只能校验/提示，不能作为通用深拷贝恢复；v1 内部预备份与高级兼容入口继续可用。Windows 安装包在此次源码变更后已过期，Windows 实机未覆盖。

### 自包含工作区与原地恢复门禁（2026-07-27）

- 新建工作区必须在同一文件夹形成标记、`templates/`、题目图片目录、独立 SQLite、撤销
  备份、恢复前预备份、恢复状态和 cache；标记与数据库不得保存当前机器绝对模板路径。
- 已有 V2 数据升级必须先复制再校验，失败不得删除全局旧行、移动源码或发布半个工作区。
  升级后业务查询必须来自 `.awb/workspace.sqlite`。
- 切换工作区必须先取消并等待活动 AI 与后台任务，再关闭旧工作区数据库；切换后模板、
  题目、关系、计划、执行和数据状态不能串到另一个工作区。
- A 包原地恢复到当前 B 后，B 的容器路径、名称和 UUID 不变；切到 A 再切回 B 以及重启
  后，模板相对路径/源码哈希、元数据、题目、图片、关系、计划和执行必须保持。
- 恢复前预备份必须包含被替换的模板源码；SQLite 提交前和提交后模拟中断都必须通过
  journal 恢复到完整旧状态或完成完整新状态，不能留下数据库与文件树不一致。
- 中文和跨平台结论仍分层报告：macOS 自动化证明 UTF-8/NFC 与 GBK 原始字节契约；只有
  Windows 原生 runner 和真实 Windows 往返分别完成后，才能声称对应平台验证通过。
- 最终源码门禁：`npm run check` 通过 TypeScript、ESLint 0 warnings、Prettier、49 个
  Vitest 文件/375 项和 8 项发布脚本测试；完整真实 Electron E2E 为 57 项常规用例全部
  通过、2 项 packaged 因未设置路径按条件跳过。定向证据包括备份恢复 5/5、数据诊断计数 1/1、总体文件管理
  5/5、模板入库 8/8、模板移动 2/2、工作区数据边界 1/1 和首页本地化 1/1。
  Provider 4/4 和题目 AI 7/7 同时通过；模板元数据 AI 串行流程重复两轮 16/16
  通过。
- 备份与恢复正常页已人工检查 1440×900、1280×720、1024×640 的亮色/深色状态；恢复
  对比页明确展示来源、当前目标、数量对比、原地替换警告和确认区。未发现横向溢出，紧凑
  窗口的主操作可达。
- 当前 `release/mac-arm64/算法学习工作台.app` 的全新/已有 V2 userData packaged smoke
  2/2 通过；主程序与 `better_sqlite3.node` 均为 arm64，版本 0.1.2，`app.asar` SHA-256
  为 `3d5f546c25e23d96a9be6c58a693a7c444f9eeceeb4a59b6f3ed007f4a1ee32a`。该 App 仅
  ad-hoc/linker-signed、无 TeamIdentifier、未公证。
- 当前源码的隔离快照 `26dd07dcf486663c5c917608a26cefdea3a53df1` 已在原生
  Windows x64 runner 生成未签名 NSIS Preview；应用主程序和 `better_sqlite3.node`
  均验证为 x64，全新/已有 V2 userData packaged smoke 2/2、运行时依赖审计 0 漏洞与
  ASAR 隐私扫描通过。安装器位于
  `release/downloaded/Windows测试包-0.1.2-self-contained-26dd07d/`，115,905,616
  bytes，SHA-256 为
  `1ea82f1e32a1fc9b8b583edc54fe68acce0d2e01cf8e8dfff09905e0409d9190`。真实
  Windows 的 SmartScreen、权限、快捷方式、卸载和 Mac→Windows→Mac 人工恢复仍不计为
  通过；完整 npm 审计另有 17 条仅位于打包开发工具链的上游告警，未执行破坏性强制降级。

### AI 文件计划输出长度门禁（2026-07-24）

- 总体文件 AI 使用 24,000 Token 单批输入预算、16,000 Token 目录上下文预算和 4,096 Token 单批输出上限；预览哈希和正式生成必须使用同一组 Main 常量，不得由 Renderer 传入任意预算。
- 31 个相互独立的小候选即使输入总量能装入一批，也必须拆为 8 批；除共享路径形成的不可拆分审计组外，每批候选不超过 4 个、审计问题不超过 6 个。每批稳定前缀仍包含完整目录树及全部模板 ID、名称、相对路径和语言。
- Provider 只有在可识别的 Token/上下文上限拒绝时才能从 4,096 降到 2,048；鉴权、模型不存在、普通参数错误、响应超时和无正文不得误降档。
- 连接超时、响应超时和流中断必须报告第 `x/y` 批、该批输入估算、候选数、输出上限和已完成批数，并保留原 `retryAfterMs`/阶段；导出的安全诊断不得包含路径、源码、笔记或密钥。
- 任一批失败或取消不得继续发送后续批次，不得创建部分计划；当前批次之外的操作、跨批目标冲突、必需改名缺失和总操作数超限都必须整份拒绝。
- 调整分批与输出预算不扩大执行权限：1 MiB 响应读取上限、结构化输出校验、单计划 100 项、逐字段长度、Diff、逐项选择、二次确认、备份与回滚保持不变。
- 定向 Vitest 2 个文件/26 项通过；`npm run check` 为 44 个 Vitest 文件/338 项与 8 项发布脚本测试；总体文件 AI 真实 Electron E2E 5/5、重新生成的 macOS arm64 测试 App packaged smoke 2/2 通过。首次定向 E2E 暴露工作区扫描完成前切页的测试时序，加入确定性扫描完成等待后完整复跑通过。
- 本切片没有数据库 schema、migration、IPC/Zod、Provider 协议类型、密钥、权限、备份格式、执行/回滚协议、依赖或视觉变化；Windows 实机与正式签名/公证仍未验证。

### AI 文件计划输出感知分批实测（2026-07-25）

- 定向合同/Main/Renderer 为 3 个文件/50 项通过；其中 31 个独立小候选固定拆为 8 批，每批详细候选不超过 4、输出请求为 4,096 Token，每批缓存稳定前缀均包含全部模板 ID。共享路径的 5 候选审计组保持同批。
- 超时测试覆盖第二批 `AI_RESPONSE_TIMEOUT`：错误保留 `retryAfterMs` 与 `response-read` 阶段，安全诊断记录已完成批数、失败批次、输入 Token 和候选数；计划创建调用为 0。取消、越批操作、跨批目标冲突和 101 项合并上限继续整份拒绝。
- `npm run check` 通过 TypeScript、ESLint 0 warnings、Prettier、48 个 Vitest 文件/363 项和 8 项发布脚本测试；完整真实 Electron E2E 为 61 项通过、2 项 packaged 条件跳过，补充深色预览截图后文件管理定向 E2E 5/5 再次通过。
- 重新生成 `release/mac-arm64/算法学习工作台.app` 并以包内 arm64 可执行文件完成全新/已有 V2 userData packaged smoke 2/2。`app.asar` SHA-256 为 `7315188ef01f47a9777844c903c1bd4d8281e02a112456d5bc5ef8fc9b72647c`。
- 发送预览已人工复核 1440×900 亮/暗和 1024×640 亮色：批数、单批候选上限、4,096 Token 输出上限可见，内部滚动与固定底部操作可达，无横向溢出。
- 本轮没有数据库 schema、migration、依赖、系统权限、Provider 协议类型、备份或回滚格式变化。全新安装、空白工作区和已有 V2 数据原位兼容；测试 App 仍是 0.1.2 macOS arm64 未正式签名/公证版本，Windows 实机未覆盖。

## 发布门禁

- macOS/Windows 产物由平台 runner 构建，原生 SQLite 与当前 Electron ABI 匹配。
- 使用全新应用数据目录和已经写入 V2 数据的目录分别运行打包后二进制 smoke test；旧 schema migration 由完整 E2E 独立覆盖。
- DMG/安装包结构、Info.plist/文件版本、App 与 better-sqlite3 架构、SHA-256、SBOM、隐私扫描和签名状态在同一次发布流程中验证并记录。
- 发布脚本只按 `package.json` 精确选择当前版本/平台/架构制品，不得用宽泛 glob 混入 `release/` 中的历史版本。
- `preview` 必须主动移除签名环境并明确标记未签名；`signed` 缺证书、公证凭据或最终签名证据时必须失败关闭。
- 公开发布必须完成平台代码签名；未签名产物只能标记为开发预览。
- Windows 正式质量声明必须有真实 Windows 安装、启动、升级与卸载证据，不能只依赖交叉构建或 CI 产物。

## Session D 最终实测（2026-07-18）

| 命令/证据          | 结果                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `npm run check`    | 通过：TypeScript、ESLint 0 warnings、Prettier、26 个 Vitest 文件/190 项测试、3 项发布脚本测试                |
| `npm run test:e2e` | 通过：50 项常规 Electron E2E；2 项 packaged 因未重新生成目录包而按条件跳过；总耗时约 2.3 分钟                |
| Session D 定向 E2E | 7 项布局/可访问性、4 项文件计划、滚动/代码查看和应用主流程均通过                                             |
| 截图矩阵           | 32 张四页面尺寸/主题/200% 原图，加减少动效、分隔条焦点和 4 张联系图，已人工复核                              |
| 打包               | 本 Session 未重新打包；没有复用 Session C 旧候选摘要，Session C 发布脚本仍由 `npm run check` 的 3 项测试保护 |

## Session D 后续修复实测（2026-07-18）

| 命令/证据                       | 结果                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                 | 通过：TypeScript、ESLint 0 warnings、Prettier、27 个 Vitest 文件/195 项测试、3 项发布脚本测试                          |
| `npm run test:e2e`              | 通过：52 项常规 Electron E2E；2 项 packaged 未设置路径时按条件跳过；最终全量重跑约 2.4 分钟                            |
| 长图与执行记录定向 Electron E2E | `app.spec.ts` 9 项、`file-management.spec.ts` 4 项通过；真实 Main/Preload/Renderer 与 SQLite 路径均覆盖                |
| 题目卡片滚动与关闭 Electron E2E | 题目列表、详情、编辑表单均通过滚轮和滚动条拖动；新建/编辑 `X` 中心点击命中按钮、关闭并恢复焦点                         |
| AI 发送预览关闭 Electron E2E    | 预览 `X`/Escape 退出整卡；生成中 `X` 命中按钮、取消连接、零写入并回焦；底部取消继续保留草稿                            |
| Repository/契约                 | 9 项定向测试通过；覆盖 UUID 去重/边界、工作区/状态全量校验和删除中途失败的事务回滚                                     |
| 截图                            | 新增 2 张 1024×640 题目详情/编辑滚动图；原 6 张长图/亮暗删除确认/数据同步关键图继续保留并人工复核                      |
| migration / Renderer 权限       | 本次滚动/关闭修复无 migration、IPC、系统权限或 ADR；Renderer 仍无 Node/SQLite/文件系统权限                             |
| 目录包                          | 从 `e46235e` 执行 `package:dir`；全新与已有 V2 userData packaged smoke 2 项通过，并通过隔离 bundle ID 的真鼠标关闭验收 |

## Session E 最终实测（2026-07-19）

| 命令/证据               | 结果                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run check`         | 通过：TypeScript、ESLint 0 warnings、Prettier、28 个 Vitest 文件/201 项、3 项发布脚本测试                          |
| `npm run test:e2e`      | 通过：54 项常规 Electron E2E；2 项 packaged 未设置路径时按条件跳过                                                 |
| `benchmark:performance` | 1k/5k/10k、每项 5 次；10k 启动 P50/P95 1923.12/2349.86 ms，无变化重扫 805.45/1045.77 ms，取消 0.27/0.59 ms         |
| 增量工作量              | 10k 无变化 `0` 哈希、`10,000` 复用；强制完整 `10,000` 哈希；取消不改变 `scan_stats_json`                           |
| 大列表 Electron E2E     | 644 模板、126 题、110 关系、105 计划和 105 执行记录全部键集遍历且 ID 唯一；首批外模板可搜索定位                    |
| UI/键盘/截图            | 大型模板/题目分页、Arrow/Home/End、滚轮与原生滚动条通过；新增 1440×900 亮色、1024×640 亮暗和 1280×720 减少动效截图 |
| migration / userData    | 全新 userData、旧 stage-1 schema、已有结构化题目 schema 均原位升级；索引失败/取消保留上一完整版本                  |
| 打包与平台              | 本 Session 未执行 `package:dir`，未复用旧候选摘要；证据为 macOS arm64，Windows 大工作区实机仍未验证                |

## Session F 第一切片实测（2026-07-19）

| 命令/证据            | 结果                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`      | 通过：30 个 Vitest 文件/209 项测试、3 项发布脚本测试；TypeScript、ESLint 0 warnings、Prettier 全部通过                                                                                |
| `npm run test:e2e`   | 通过：54 项常规 Electron E2E；2 项 packaged 未设置路径时按条件跳过；完整重跑约 2.6 分钟                                                                                               |
| 针对性 Renderer 测试 | 4 个文件/19 项通过；覆盖 App、快捷键解析、工作区路由优先级和代码查看器回归                                                                                                            |
| 拆分边界             | `App.tsx` 约 292 行；无数据库字段、migration、IPC、后台协议或系统权限变化                                                                                                             |
| 目录包               | 未重新打包；继续使用上一已验证目录包 `release/mac-arm64/算法学习工作台.app`                                                                                                           |
| 性能 smoke           | 正式 1k/5k/10k 每项 5 次通过；当前启动 P50/P95 为 3276.85/3534.93、3493.57/3510.67、3554.88/3591.87 ms；与同条件临时 `d378a82` 1k 对照 3445.23/3535.73 ms，未观察到拆分导致的启动回归 |

## Session F 第二切片实测（2026-07-19）

- 基线：`18a8f9e docs: hand off session f app split`；代码结束提交：`9c195b6 refactor: split template management plan services`。
- 服务职责已拆为审计、AI 计划生成、计划安全校验、执行/备份/回滚和计划历史五个语义文件；Facade 对外 API 与 IPC 调用保持不变。
- `npm run check`：31 个 Vitest 文件、211 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过。沙箱首次运行的 Electron/本地端口 `EPERM` 已在允许 GUI/端口后重跑，不计为应用失败。
- 性能：`PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance` 通过；原始报告为 `output/performance/session-e-session-f-template-service-split-final.md`。10k 启动 P50/P95 `2990.48/3200.29 ms`，无变化重扫 `672.21/732.82 ms`，审计 `87.94/90.36 ms`，AI 候选 `144.00/158.31 ms`，取消 `0.27/0.39 ms`；`hashed=0`、`reused=unchanged=10,000`。
- 本切片没有新增数据库字段、migration、IPC 名称、后台任务协议、文件备份格式、Zod 契约、权限或视觉 token；未重新打包、未新增截图矩阵。既有 Session D/E 截图和上一目录包只作为未受影响的回归证据。
- 全新 userData、已有 V2 userData、旧 V2 schema migration、文件外部修改复检、取消和异常补偿回滚均由现有 E2E/性能测试继续覆盖；Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第三切片实测（2026-07-19）

- 基线：`671684d docs: record final template service size`；特征测试提交：`bdffac3 test: characterize ai provider workspace`；代码提交：`75aad5f refactor: split ai provider workspace`。
- `ai-provider-workspace.tsx` 从 745 行降至 246 行，页面容器、编辑表单/任务路由、Provider 列表和纯表单转换形成明确职责；`use-ai-providers.ts` 仍是唯一 Preload 调用层。
- 先新增 3 项 Renderer 特征测试，锁定密钥保留、请求构造、任务路由、预设创建和无效请求头阻断；实现提交前定向 2 个测试文件/5 项通过。
- `npm run check`：32 个 Vitest 文件/214 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过；总耗时约 2.5 分钟。
- Provider E2E 重新生成并人工复核 1440×900 亮色、1280×720 紧凑和 1440×900 深色截图；布局、滚动、状态反馈、主题和主操作无视觉变化，Session D 的 1024×640/200% 矩阵继续作为回归证据。
- 本切片没有改变 SQLite schema、migration、IPC、Zod、后台任务、备份格式、Provider 协议、能力/错误边界、密钥语义或安全上限，也未重新打包。
- 扫描、查询、启动、索引和分页路径未受影响，因此没有重跑性能基准；Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第四切片实测（2026-07-19）

- 基线：`6b09f16 docs: hand off session f provider split`；特征测试提交：`f7eb981 test: characterize problem analysis dialog`；代码提交：`ee52a21 refactor: split problem analysis relations`。
- `problem-analysis-dialog.test.tsx` 新增 3 项组件特征测试，覆盖手动标签去重与关系筛选、AI 请求预览/分析/只补空字段/自动勾选候选，以及生成中关闭先取消活动请求。
- `problem-analysis-dialog.tsx` 从 969 行降至 826 行；新增 193 行的 `problem-analysis-relations.tsx`，只负责受控模板搜索、选择、候选勾选、关系类型/备注和移除，不访问 Preload。
- `npm run check`：33 个 Vitest 文件/217 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：沙箱内首次运行因 Electron GUI 与本地 mock 端口被 `EPERM` 拒绝；授权本地 GUI/端口后完整重跑为 54 项常规真实 Electron E2E 通过、2 项 packaged 条件跳过，总耗时约 2.4 分钟。
- 重新生成并人工复核 `unified-problem-multi-template-{light,dark}-{1440x900,1280x720}.png`；关联草稿结构、滚动、亮暗层级、紧凑主操作和焦点边界无视觉变化，Session D 的 1024×640/200% 矩阵继续作为回归证据。
- 本切片没有数据库、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖变化；扫描/查询/启动路径不受影响，因此没有重跑性能基准或目录包。

## Session F 第五切片实测（2026-07-19）

- 基线：`1d196ef docs: hand off session f problem relation split`；特征测试提交：`b2698d4 test: characterize problem workspace details`；代码提交：`0b13ff2 refactor: split problem workspace`。
- `problem-workspace.tsx` 从 904 行降至 539 行；新增 405 行的 `problem-details-panel.tsx`，父工作区保留列表、搜索、虚拟滚动、分页、键盘导航、`ResizableLayout` 和对话框装配，详情组件承载选中题目详情与详情操作确认。
- 先新增 3 项题目工作区详情调用特征测试，再移动实现；定向题目工作区 2 个测试文件/6 项通过，锁定可用模板打开、解除关联确认、添加图片和删除确认调用特征。
- `npm run check`：34 个 Vitest 文件/220 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 2.4 分钟。
- Playwright 重新生成或复用题目工作区的 1024×640 亮色/深色、1280×720 和 1440×900 亮暗截图并人工复核；详情区 DOM/class、滚动、焦点、主题和主操作无视觉变化。扫描、查询、启动和后台任务路径未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖；全新 userData、已有 V2 userData、旧 schema 原位升级和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第六切片实测（2026-07-20）

- 基线：`c4356cd docs: hand off session f problem details split`；特征测试提交：`be85ed6 test: characterize file management history`；代码提交：`e09825a refactor: split file management history panel`。
- `file-management-workspace.tsx` 从 1,156 行降至 861 行；新增 403 行的 `file-management-history-panel.tsx`，父工作区保留扫描、AI 请求、任务状态、错误/成功播报和全部 Preload 调用，历史组件承载计划/执行记录、键盘、分页和确认面板。
- 先新增 3 项文件管理历史职责/调用特征测试，再移动实现；锁定历史区 End/Enter 键盘定位、计划归档/重新草拟和执行记录回滚/删除确认。
- `npm run check`：35 个 Vitest 文件/223 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 2.6 分钟。
- Playwright 重新生成并人工复核文件计划历史确认态的 1440×900、1280×720 亮暗截图；历史区 DOM/class、内部滚动、键盘定位、确认焦点、主题和主操作无视觉变化。扫描、查询、启动和后台任务路径未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token 或依赖；全新 userData、已有 V2 userData、旧 schema 原位升级、文件执行/回滚和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第七切片实测（2026-07-21）

- 基线：`91f7090 docs: hand off session f file history split`；特征测试提交：`a28bf3c test: characterize file plan review`；代码提交：`e403e44 refactor: split file plan review panel`。
- `file-management-workspace.tsx` 从 861 行降至 654 行；新增 269 行的 `file-management-plan-review-panel.tsx`。父工作区保留 AI 预览/生成/取消、全部 Preload 调用、计划执行、任务状态、错误/成功播报和刷新，审查组件承载分组/Diff、勾选、空状态、取消/诊断按钮及执行二次确认。
- 先新增 3 项文件计划审查职责/调用特征测试，再移动实现；锁定分组/Diff/独立勾选、零操作与无计划空状态、取消/诊断调用、确认焦点回归和精确 `operationIds`。
- `npm run check`：35 个 Vitest 文件/226 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：最终单次完整运行 54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 3.3 分钟。沙箱内 Electron/本地端口 `EPERM` 不属于应用失败；授权后首次完整运行遇到一次既有模板弹窗 X 命中时序波动，定向 9 项和随后完整 54 项均通过。
- Playwright 重新生成并人工复核 `stage5-file-plan-light.png`、`stage5-file-plan-light-1280x720.png` 和 `stage5-file-plan-dark.png`；计划分组、Diff、复选框、侧栏、滚动、焦点、主题和主操作无视觉变化。扫描、查询、启动和后台任务路径未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务、备份格式、Provider 协议、安全上限、布局偏好、视觉 token、依赖或 ADR；全新 userData、已有 V2 userData、旧 schema 原位升级、文件执行/回滚和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第八切片实测（2026-07-21）

- 基线：`7ca17b0 docs: hand off session f file plan review split`；特征测试提交：`fecfdfc test: characterize file management audit`；代码提交：`a0254a9 refactor: split file management audit panel`。
- `file-management-workspace.tsx` 从 654 行降至 573 行；新增 99 行的 `file-management-audit-panel.tsx`。父工作区保留审计启动/轮询/取消、任务状态、播报和全部 Preload 调用，审计组件承载进度、结果时间、截断、问题列表、40 条边界和无问题空状态。
- 先新增 3 项只读审计职责/调用特征测试，再移动实现；锁定进行中计数与取消任务参数、问题分类/路径/确定性说明，以及空结果、截断提示、下一步和第 40/41 条边界。
- `npm run check`：35 个 Vitest 文件/229 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 按条件跳过，总耗时约 3.1 分钟。
- Playwright 重新生成并人工复核 `stage5-file-plan-light.png`、`stage5-file-plan-light-1280x720.png` 和 `stage5-file-plan-dark.png`；审计标题/计数、问题分类、内部滚动、侧栏排列、主题和主操作无视觉变化。扫描、查询、启动和后台任务实现未改变，未重跑性能基准；未重新打包。
- 本切片没有改变 SQLite schema、migration、IPC/Zod、后台任务种类/协议、备份格式、Provider 协议、安全上限、布局偏好、视觉 token、依赖或 ADR；全新 userData、已有 V2 userData、旧 schema 原位升级、审计取消、文件执行/回滚和异常中断回归继续由现有 E2E 覆盖。Windows 实机、VoiceOver 长流程和正式签名/notarization 仍未完成。

## Session F 第九切片实测（2026-07-21）

- 基线：`d942ce4 docs: hand off session f file management audit split`；特征测试提交：`361a7b6 test: characterize data backup restore workspace`；代码提交：`85064b6 refactor: split data backup restore panel`；文档交接提交见本文所在提交。
- `data-management-workspace.tsx` 从 1,164 行降至 1,029 行；新增 194 行 `data-backup-restore-panel.tsx`。父工作区继续承载生命周期/中断恢复/隔离流程、全部 `dataManagement` Preload 调用、诊断刷新、恢复确认焦点引用、状态播报和页面组合；新组件只接收受控数据与回调。
- 先新增 3 项特征测试，再移动实现：锁定导出源码范围与 manifest 展示、独立校验调用、恢复预览焦点/显式确认/精确恢复参数及 Provider 密钥重填播报。实现提交前定向 3 项通过，typecheck、ESLint 0 warnings、Prettier 通过。
- `npm run check`：36 个 Vitest 文件/232 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：授权 GUI/本地 mock 端口后 54 项常规真实 Electron E2E 通过；2 项 packaged 因未设置 `PACKAGED_APP_PATH` 条件跳过，总耗时约 2.7 分钟。首次沙箱尝试的 Electron/端口 `EPERM` 是环境限制，非应用失败。
- Playwright 真实数据管理导出/恢复流程通过；本切片没有视觉意图，复用并人工复核 `output/playwright/session-d-final/` 中 1440×900、1280×720、1024×640 和 200% 亮暗数据管理矩阵，未改变 DOM/class、滚动、焦点、live region 或视觉 token。
- 没有改变 SQLite schema、migration、IPC/Zod、备份格式、Provider 协议、后台任务、安全上限、依赖或权限；全新 userData、已有 V2 userData、旧 schema migration、恢复前备份、故障回滚和中断恢复由现有 E2E 继续覆盖。
- 扫描、查询、索引、分页、启动和后台任务路径未改变，未重跑 `PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance`；最近性能证据仍为 `output/performance/session-e-session-f-template-service-split-final.md`。该切片阶段未重新打包，最终收尾另有 unsigned beta 证据。
- 外部限制不变：当前 `security find-identity -v -p codesigning` 为 `0 valid identities found`，主机为 macOS arm64，没有真实 Windows 安装环境；正式签名/notarization、Windows Authenticode/安装验收、VoiceOver 长流程和 Windows Narrator/高对比实机检查仍未完成。

## Session F 第十切片实测（2026-07-21）

- 基线：`b8f4456 docs: hand off session f data backup split`；特征测试提交：`289e665 test: characterize interrupted recovery workspace`；代码提交：`436ff70 refactor: split interrupted recovery panel`；文档交接提交见本文所在提交。
- `data-management-workspace.tsx` 从 1,029 行降至 889 行；新增 190 行 `data-interrupted-recovery-panel.tsx`。父工作区继续承载生命周期刷新、隔离治理、全部 `dataManagement` Preload 调用、恢复结果发布、重新诊断、状态播报和页面组合；新组件只接收受控数据与回调。
- 先新增 3 项特征测试，再移动实现：锁定可恢复/受保护条目及精确预览 ID、状态变化时阻止确认与恢复，以及显式确认后的精确 `confirmRecovery: true` / `operationId` / `retentionPolicy` 请求、诊断刷新和成功播报。实现提交前定向 6 项通过，typecheck、ESLint 0 warnings、Prettier 通过。
- `npm run check`：36 个 Vitest 文件/235 项通过；3 项发布脚本测试通过；TypeScript、ESLint 0 warnings、Prettier 全部通过。
- `npm run test:e2e`：首次沙箱运行因 Electron GUI/本地端口 `EPERM` 失败；授权后完整 Playwright 结果为 `passed` 且无失败测试，即 54 项常规真实 Electron E2E 通过、2 项 packaged 因未设置 `PACKAGED_APP_PATH` 条件跳过。
- 数据管理中断恢复真实 Electron E2E 继续覆盖中断隔离退回、SQLite 提交前恢复旧状态和提交后完成新状态；本切片没有视觉意图，复用并人工复核 `output/playwright/session-d-final/` 中 1440×900 亮暗、1024×640 紧凑和 200% 深色数据管理原图，未改变 DOM/class、滚动、焦点、live region 或视觉 token。
- 没有改变 SQLite schema、migration、IPC/Zod、备份/中断恢复格式、Provider 协议、后台任务、安全上限、依赖或权限；全新 userData、已有 V2 userData、旧 schema migration、恢复前备份、故障回滚和中断恢复由现有 E2E 继续覆盖。
- 扫描、查询、索引、分页、启动和后台任务路径未改变，未重跑 `PERF_SIZES=1000,5000,10000 PERF_RUNS=5 npm run benchmark:performance`；最近性能证据仍为 `output/performance/session-e-session-f-template-service-split-final.md`。第十切片阶段未重新打包，最终收尾另有 unsigned beta 证据。
- 外部限制不变：当前 `security find-identity -v -p codesigning` 为 `0 valid identities found`，主机为 Darwin 25.5.0 arm64，没有真实 Windows 安装环境；正式签名/notarization、Windows Authenticode/安装验收、VoiceOver 长流程和 Windows Narrator/高对比实机检查仍未完成。

## Session F 最终收尾门禁（本次）

Session F 已正式结束，不再执行第十一切片或继续维护性拆分。源码候选来源为干净提交 `39421c0329c463657cb43c4e552949e48bee93c9`；最终文档提交晚于候选来源时，不能把最终 HEAD 与候选来源混为一谈。

- `npm run check`：36 个 Vitest 文件/235 项、3 项发布脚本测试通过；TypeScript、ESLint（0 warnings）、Prettier 通过。
- `npm run test:e2e`：54 项常规真实 Electron E2E 通过，2 项 packaged 条件跳过；授权 GUI/本地端口后完整 56 项无失败。
- `npm run release:mac:preview`：成功生成 `0.1.2` macOS arm64 unsigned/ad-hoc beta；DMG 138,104,754 B / `798c94f809bb42a87eb2bff12c861f507c3b6c8fc44c5e1cf0b357a3ac742662`，ZIP 137,580,378 B / `e918b578d465b5eda1c146e14dff2d30721a4f1c7a941baddd1c4a922f73943b`。
- App 与 `better_sqlite3.node` 均为 Mach-O arm64；Info.plist appId/版本/最低系统版本正确；源 PNG 与打包 `icon.icns` 均 1024×1024 alpha；`hdiutil verify`、ZIP 完整性和 `SHA256SUMS.txt` 通过。
- 候选证据含 CycloneDX SBOM（93 个组件）、构建元数据、发布说明和隐私报告；ASAR 10,739 条目、App 文件 316 个，禁用内容、个人绝对路径和疑似密钥均 0 命中。
- packaged smoke：候选 App 的全新 userData 和已有 V2 userData 重启各 1 项通过。
- 签名状态：无 Authority/TeamIdentifier、未 staple、Gatekeeper 不接受；该产物明确是测试分发用 unsigned/ad-hoc beta，不是正式签名版本。
- 性能基准不重跑；本次只改文档，没有触及扫描、查询、索引或启动实现。正式 macOS signed/notarized、Windows Authenticode/真实安装、VoiceOver 长流程和 Windows 辅助技术仍未完成。

## 完整工作区与总体文件 AI 上下文实测（2026-07-23）

- 新建模板/题目完整目录阶段从 `89dbde315457e95be0ec8198c7830c3c69b10288` 开始，并发 Windows 工作后的实际基座为 `95a7795a8aac249714f4f6a3ddecd4e3066cdf87`；ADR/功能提交为 `ac69d14`、`720fca6`。总体文件 AI 阶段从 `fabb334` 开始，提交为 `ce3b999`、`700f342`、`b1ccd6a`、`327614a`、`1174131`。
- 三类 AI 入口统一使用完整 `WorkspaceTemplateCatalog`；不再设置 300 个模板或 250 个候选的产品级数量硬上限。301 个短模板实测为 98,774 字符/估算 24,694 Token，500 个短模板为 162,916 字符/估算 40,729 Token，全部 ID、名称、相对路径、语言和分级树均保留，`templateNamesTruncated === false`。
- 总体文件请求统一按最终序列化 payload 预算；先缩短摘要、省略附加元数据和可选源码，再省略非审计详细候选。审计必需候选或最小完整目录仍超 96,000 输入 Token 安全预算时，在网络前返回 `AI_CONTEXT_TOO_LARGE`，不发送残缺目录。
- `previewFilePlan` 创建 Main 内存中 5 分钟 TTL、一次性消费的 `previewId` 快照；`generateFilePlan` 只消费该快照。发送前复检工作区、Provider/模型、catalog、候选 SHA-256/mtime/size 与 metadata 版本；预览过期、重复消费、跨工作区或外部修改均拒绝发送。
- 用户笔记默认不发送；显式开启后才进入候选元数据、字符/Token 预算和预览统计。SHA-256、mtime、大小、绝对路径、数据库/备份路径、API Key、密钥引用和自定义鉴权头只留在 Main，不进入 Provider payload。
- 计划审查显示 `solves`、`constraints`、`prerequisites`、`commonMistakes`、`timeComplexity`、`spaceComplexity`、`tags`、`notes` 的旧值到新值；notes 标记高风险，当前 `update-metadata` 计划必须包含 `previousMetadata`。所有删除默认不选，高度相似删除显示本地保留项证据。
- 定向 Vitest 最终为 4 个文件/33 项通过；`npm run check` 通过 TypeScript、ESLint 0 warnings、Prettier、40 个 Vitest 文件/270 项和 8 项发布脚本测试。受影响的文件管理、题目分析、模板入库 Electron 规格合计 18/18 通过。
- 最终单次 `npm run test:e2e` 为 57 项常规真实 Electron E2E 通过，2 项 packaged 因未设置 `PACKAGED_APP_PATH` 条件跳过。首次沙箱运行的 Electron `EPERM` 属环境限制；完整套件曾检出一处重复英文翻译覆盖，修复并定向通过后再次全量运行无失败。
- 文件计划新增 9 张截图：notes 开/关预览、1440×900 亮/暗、1280×720、1024×640、完整元数据 Diff 与二次确认。已人工复核完整目录统计、预算退化提示、删除默认态、滚动、焦点和固定操作区；原有模板/题目完整目录 8 张截图继续有效。
- 当前格式：文件计划只读取 `schemaVersion: 2` payload，`update-metadata` 必须有旧值快照；旧裸数组、旧软归档列表和旧隔离 IPC 不再兼容。当前 AI Provider、生成、预览、执行和回滚协议保持不变。
- 本 Session 没有修改 release 脚本/依赖，没有重跑性能基准，没有打包、没有推送。`.codex/config.toml` 与 `问题反馈.txt` 始终保持在暂存/提交之外。

## 已有模板 AI 元数据补全门禁（2026-07-24）

- 单份与批量入口必须先展示 AI 发送预览；用户确认生成前不得发起 Provider 请求，确认保存前不得写入 SQLite 或模板文件。
- 只允许建议 `commonMistakes`、`constraints`、`prerequisites`、`solves`、`spaceComplexity`、`tags`、`timeComplexity`；非空字段和 `notes` 必须由 Main 强制保留，`notes` 不得进入 Provider payload。
- 一批最多 20 份；没有空字段的模板不得调用 Provider。用户可逐模板、逐字段取消建议，零选择时保存按钮禁用。
- 预览/草稿必须绑定当前工作区、Provider/模型、完整目录版本、源码 SHA-256 和元数据版本；过期、重复消费、工作区切换或版本变化失败关闭。
- 批量确认必须只调用一次事务式 `upsertMetadataBatch`；任一源码或元数据变化时零写入。取消活动请求后迟到响应不得生成可保存草稿。
- 定向 Vitest 3 个文件/21 项通过；`npm run check` 通过 46 个 Vitest 文件/349 项与 8 项发布脚本测试；真实 Electron `template-intake.spec.ts` 8/8 通过。新增草稿截图已按 1440×900 亮/暗、1280×720、1024×640 人工检查，内容、对比度、滚动和固定操作区正常。
