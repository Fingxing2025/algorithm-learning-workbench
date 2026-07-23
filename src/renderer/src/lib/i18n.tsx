import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'

export type AppLocale = 'en' | 'zh-CN'

const LOCALE_STORAGE_KEY = 'ui:locale'

const english: Record<string, string> = {
  'AI 变更先预览': 'Preview AI changes first',
  'AI 管理': 'AI Management',
  'AI 生成已取消，未创建计划或修改文件。':
    'AI generation cancelled. No plan was created and no files were changed.',
  'AI 设置': 'AI Settings',
  'Provider 列表面板': 'Provider list panel',
  'Provider 详情面板': 'Provider details panel',
  'Provider 列表宽度 {size} 像素': 'Provider list width: {size} pixels',
  个模板: 'templates',
  '个模板 · 本地索引': 'templates · local index',
  '个模板 · {problemCount} 道题': 'templates · {problemCount} problems',
  个模板已关联: 'templates linked',
  个支持的源码文件: 'supported source files',
  个标签: 'tags',
  个问题: 'issues',
  个项目: 'items',
  个项待审: 'pending',
  道题: 'problems',
  '为模板补充结构化信息，让搜索和关联更准确。':
    'Add structured details to improve search and relations.',
  主导航: 'Main navigation',
  应用导航面板: 'Application navigation panel',
  了解更多: 'Learn more',
  从当前索引快速打开模板: 'Quickly open a template from the current index',
  从第一份模板开始: 'Start with your first template',
  '使用 AI 建议': 'Use AI suggestion',
  保留我的内容: 'Keep my content',
  关联: 'Relations',
  '关系双向可见，源码与学习记录始终保存在本地。':
    'Relations are visible from both sides, while source and learning records stay local.',
  关闭提示: 'Dismiss notification',
  关闭全局搜索: 'Close global search',
  '创建或选择一个普通文件夹即可开始。': 'Create or choose a regular folder to get started.',
  创建工作区: 'Create workspace',
  创建第一张题目卡片: 'Create your first problem card',
  删除: 'Delete',
  切换到中文界面: 'Switch to Chinese',
  切换到英文界面: 'Switch to English',
  切换到浅色主题: 'Switch to light theme',
  切换到深色主题: 'Switch to dark theme',
  切换主题: 'Toggle theme',
  切换语言: 'Switch language',
  当前工作区: 'Current workspace',
  当前工作区页面: 'Current workspace page',
  当前索引: 'Current index',
  '已切换到 {page}': 'Switched to {page}',
  当前没有待处理变更: 'No pending changes',
  待确认计划: 'Pending plans',
  '待确认计划，打开 AI 管理': 'Pending plans, open AI Management',
  '当前题库中的题目都已经关联到该模板。':
    'Every problem in the library is already linked to this template.',
  快捷操作: 'Quick actions',
  '扫描重复模板、命名异常和缺失元数据，AI 只会先生成可审查计划。':
    'Scan duplicates, naming issues, and missing metadata. AI only creates a reviewable plan.',
  '扫描完成：发现 {count} 个模板': 'Scan complete: {count} templates found',
  '已处理 {processed}': 'Processed {processed}',
  '已处理 {processed} / {total}': 'Processed {processed} / {total}',
  取消扫描: 'Cancel scan',
  取消审计: 'Cancel audit',
  加载更多题目: 'Load more problems',
  '继续加载下一批题目。': 'Load the next batch of problems.',
  '结果按最近修改时间分批加载，当前只显示已加载部分。':
    'Results load in batches by most recent update. Only loaded items are currently shown.',
  '题目分页位置已失效，请从第一批重新加载。':
    'The problem page position is no longer valid. Reload from the first batch.',
  '继续加载下一批关联题目。': 'Load the next batch of related problems.',
  '关联题目按最近修改时间分批加载。': 'Related problems load in batches by most recent update.',
  加载更多关联题目: 'Load more related problems',
  '正在搜索完整题库…': 'Searching the full problem library…',
  '题目搜索暂不可用，请稍后重试。': 'Problem search is unavailable. Try again shortly.',
  搜索题目: 'Search problems',
  '当前批次没有可关联题目，请搜索标题、题号或标签。':
    'No linkable problems are in this batch. Search by title, code, or tag.',
  '继续加载下一批模板。': 'Load the next batch of templates.',
  '模板索引按受控相对路径分批加载。':
    'The template index loads in batches by controlled relative path.',
  '模板分页位置已失效，请从第一批重新加载。':
    'The template page position is no longer valid. Reload from the first batch.',
  加载更多模板: 'Load more templates',
  '正在搜索完整模板索引…': 'Searching the full template index…',
  '模板搜索暂不可用，请稍后重试。': 'Template search is unavailable. Try again shortly.',
  '模板搜索结果只显示前 {count} 项，请缩小关键词继续定位。':
    'Only the first {count} template results are shown. Narrow the query to keep locating.',
  '继续加载下一批计划记录。': 'Load the next batch of plan records.',
  '继续加载下一批执行记录。': 'Load the next batch of execution records.',
  '计划记录按创建时间分批加载。': 'Plan records load in batches by creation time.',
  '执行记录按创建时间分批加载。': 'Execution records load in batches by creation time.',
  '历史记录分页位置已失效，请从第一批重新加载。':
    'The history page position is no longer valid. Reload from the first batch.',
  '已加载 {processed} / {total} 份计划；删除采用安全归档。':
    'Loaded {processed} / {total} plans. Deletion uses safe archiving.',
  加载更多计划记录: 'Load more plan records',
  加载更多执行记录: 'Load more execution records',
  搜索模板: 'Search templates',
  搜索模板名称或路径: 'Search template name or path',
  '当前批次没有可关联模板，请搜索名称或路径。':
    'No linkable templates are in this batch. Search by name or path.',
  '关联题目读取失败，请重试。': 'Related problems could not be loaded. Try again.',
  '只读审计已取消，现有索引和用户文件保持不变。':
    'The read-only audit was cancelled. The existing index and user files are unchanged.',
  '部分模板缺少可用的相似度索引；请重新扫描后再次审计。':
    'Some templates do not have a usable similarity index. Rescan and run the audit again.',
  '高相似候选过多，已停止继续比较以保持应用可响应。':
    'There are too many similarity candidates. Comparison stopped to keep the app responsive.',
  '还有更多建议未在当前结果中展开。':
    'Additional suggestions are not expanded in the current result.',
  '重新扫描后再次审计，或按顶层目录缩小处理范围。':
    'Rescan and audit again, or narrow the scope by top-level directory.',
  '打开 AI 管理': 'Open AI Management',
  打开全局搜索: 'Open global search',
  打开模板创建窗口: 'Open template creation',
  浏览模板库: 'Browse templates',
  浏览题目: 'Browse problems',
  本地优先: 'Local first',
  本地题目卡片: 'Local problem card',
  本地知识库还是空的: 'Your local knowledge base is empty',
  本地工作区: 'Local workspace',
  本地索引: 'Local index',
  模型与服务: 'Models & services',
  模板: 'Templates',
  模板与题目双向关联: 'Bidirectional template-problem relations',
  '模板已备份并删除，可在 AI 管理的执行记录中撤销':
    'Template backed up and deleted. Undo it from AI Management execution history.',
  模板库: 'Templates',
  模板树面板: 'Template tree panel',
  模板详情面板: 'Template details panel',
  '模板树宽度 {size} 像素': 'Template tree width: {size} pixels',
  模板概览: 'Template overview',
  模板源码: 'Template source',
  模板元数据补全: 'Template metadata completion',
  '正在打开 AI 设置…': 'Opening AI Settings…',
  '正在打开文件 AI 管理…': 'Opening File AI Management…',
  '正在读取本地工作区…': 'Reading local workspace…',
  '正在读取运行信息…': 'Reading runtime information…',
  没有待确认计划: 'No pending plans',
  添加: 'Add',
  '添加第一个 Provider 后，即可为不同 AI 任务选择模型。':
    'Add your first provider to route AI tasks to different models.',
  添加模板: 'Add template',
  算法学习工作台: 'Algorithm Learning Workbench',
  算法模板: 'Algorithm templates',
  '算法模板，打开模板库': 'Algorithm templates, open Templates',
  '管理 AI Provider、能力与任务路由': 'Manage AI providers, capabilities, and task routes',
  '管理本地模板、题目关联和 AI 文件计划。':
    'Manage local templates, problem relations, and AI file plans.',
  知识工作台: 'Knowledge workbench',
  知识库概览: 'Knowledge base overview',
  知识脉络: 'Knowledge map',
  知识脉络概览: 'Knowledge map overview',
  稍后: 'Later',
  编辑: 'Edit',
  编辑题目卡片: 'Edit problem card',
  联系: 'Relations',
  自动分类: 'Automatic classification',
  获取方式: 'Source',
  英文: 'English',
  中文: 'Chinese',
  让算法知识有清晰的节奏: 'Give algorithm knowledge a clear rhythm',
  计划: 'Plans',
  '请先创建或选择模板工作区。': 'Create or choose a template workspace first.',
  请选择: 'Select',
  请选择一份模板: 'Select a template',
  题目: 'Problems',
  题目卡片: 'Problem cards',
  题目列表面板: 'Problem list panel',
  题目详情面板: 'Problem details panel',
  '题目列表宽度 {size} 像素': 'Problem list width: {size} pixels',
  '题目卡片，打开题目库': 'Problem cards, open Problems',
  运行信息暂不可用: 'Runtime information unavailable',
  重新扫描: 'Rescan',
  重置布局: 'Reset layout',
  布局已恢复默认值: 'Layout restored to defaults',
  重新选择工作区: 'Choose workspace again',
  切换工作区: 'Switch workspace',
  选择目录: 'Choose folder',
  选择工作区: 'Choose workspace',
  '选择一个已有模板目录，先只读扫描，不会自动改名或移动文件。':
    'Choose an existing template folder. The first scan is read-only and never renames or moves files.',
  选择一份算法模板: 'Select an algorithm template',
  调整导航宽度: 'Resize navigation',
  '调整 Provider 列表宽度': 'Resize Provider list',
  调整模板树宽度: 'Resize template tree',
  调整题目列表宽度: 'Resize problem list',
  '导航宽度 {size} 像素': 'Navigation width: {size} pixels',
  进入题目库: 'Open problem library',
  近期题目: 'Recent problems',
  还没有题目卡片: 'No problem cards yet',
  还没有模板: 'No templates yet',
  '还没有配置 Provider': 'No providers configured',
  还没有选择工作区: 'No workspace selected',
  '输入关键词搜索模板、题目或执行操作': 'Search templates, problems, or actions',
  '这些计划只有在你确认后才会改动文件。': 'Plans modify files only after your confirmation.',
  '通过对话框创建一个空白目录，并从第一份模板开始。':
    'Create an empty folder in the system dialog and start with your first template.',
  搜索模板或题目: 'Search templates or problems',
  搜索知识库: 'Search knowledge base',
  '搜索模板、题目或操作': 'Search templates, problems, or actions',
  新建模板: 'New template',
  新建算法模板: 'New algorithm template',
  新建题目卡片: 'New problem card',
  '无需 AI，也能手动记录题面并关联模板。':
    'Record statements and link templates manually without AI.',
  '文件 AI 管理': 'File AI Management',
  文件不可用: 'File unavailable',
  查看全部: 'View all',
  '有新的文件整理建议等待确认；执行前可逐项查看 Diff。':
    'New file organization suggestions await review. Inspect every diff before execution.',
  需要你审查后才会执行: 'Runs only after your review',
  工作台: 'Workbench',
  '工作台任务指向此 Provider；题图分析只接受视觉模型。':
    'Route workbench tasks to this provider. Image analysis requires a vision model.',
  '已创建 {path}': 'Created {path}',
  已复制模板源码: 'Template source copied',
  已复制相对路径: 'Relative path copied',
  已在文件管理器中定位: 'Revealed in file manager',
  '已连接工作区“{name}”': 'Connected workspace "{name}"',
  已索引的本地源码: 'Indexed local source files',
  已维护: 'Maintained',
  应用内容语言: 'Interface language',
  开始使用: 'Get started',
  '整体文件 AI 管理': 'Workspace File AI Management',
  整理题面与模板关联: 'Organize statements and template relations',
  '数据保留在你选择的本地目录中。': 'Your data stays in the local folder you choose.',
  继续整理题面和模板关联: 'Continue organizing statements and relations',
  离线功能优先: 'Offline-first features',
  立即补全: 'Complete now',
  补全语言: 'Completion language',
  确认创建: 'Create template',
  确认元数据冲突: 'Review metadata conflicts',
  确认并应用选择: 'Apply selections',
  空白工作区: 'Blank workspace',
  筛选当前工作区: 'Filter current workspace',
  当前模板: 'Current template',
  '当前界面语言：中文': 'Current interface language: Chinese',
  '当前界面语言：英文': 'Current interface language: English',
  项待审: ' pending',
  'AI 整理中心': 'AI Organization Center',
  'Enter 打开第一个结果': 'Enter opens the first result',
  你的源码仍属于你: 'Your source code remains yours',
  全局搜索: 'Global search',
  创建空白工作区: 'Create a blank workspace',
  原工作区当前不可用: 'The previous workspace is unavailable',
  只读扫描: 'Read-only scan',
  打开模板库: 'Open Templates',
  打开题目库: 'Open Problems',
  '没有找到“{query}”': 'No results for "{query}"',
  '搜索模板名称、路径、题目或标签…': 'Search template names, paths, problems, or tags…',
  '搜索并打开算法模板或本地题目卡片。':
    'Search and open algorithm templates or local problem cards.',
  '新建源码文件后，它会立即进入本地索引。': 'New source files enter the local index immediately.',
  '工作区“{name}”可能已被移动、重命名或暂时卸载。应用没有修改其中的文件。':
    'Workspace "{name}" may have been moved, renamed, or temporarily disconnected. The app did not modify its files.',
  尚未连接工作区: 'No workspace connected',
  '尝试模板名称、路径、题号或标签。': 'Try a template name, path, problem ID, or tag.',
  推荐新用户: 'Recommended for new users',
  桌面运行时: 'Desktop runtime',
  连接你的模板工作区: 'Connect your template workspace',
  '连接模板工作区或创建题目后即可搜索。':
    'Connect a template workspace or create a problem to start searching.',
  选择已有模板目录: 'Choose an existing template folder',
  '首次设置 · 约 1 分钟': 'First setup · about 1 minute',
  '工作区是你自己的普通文件夹。模板源码始终保留在文件系统中，应用只建立本地索引。':
    'A workspace is a regular folder you own. Source files remain in the file system while the app builds a local index.',
  '目录授权和文件访问只发生在 Electron Main 进程。Renderer 不会获得文件系统或原始 IPC 权限。':
    'Folder authorization and file access stay in the Electron Main process. The Renderer receives neither file-system access nor raw IPC.',
}

Object.assign(english, {
  已取消: 'Cancelled',
  '计划状态已变化、仍是待确认草稿，或计划不属于当前工作区；未归档任何记录。':
    'A plan changed state, is still a pending draft, or belongs to another workspace. No records were archived.',
  '计划记录归档失败，所有记录均保持原状。':
    'Plan record archiving failed. All records remain unchanged.',
  '模板不存在或当前不可用，请重新扫描工作区。':
    'The template does not exist or is unavailable. Rescan the workspace.',
  '移动预览已过期或不属于当前工作区，请重新预览。':
    'The relocation preview expired or belongs to another workspace. Preview it again.',
  '模板索引已变化，请重新预览。': 'The template index changed. Preview the relocation again.',
  '源文件在确认前已变化，请重新预览。':
    'The source file changed before confirmation. Preview the relocation again.',
  '新路径必须与原路径不同。': 'The new path must differ from the current path.',
  '重命名时必须保留原源码扩展名。': 'Renaming must preserve the original source file extension.',
  '目标文件扩展名不受支持。': 'The destination file extension is not supported.',
  '首版不支持仅修改文件名大小写。':
    'This version does not support changing only the filename letter case.',
  '目标父目录不是安全的普通目录。': 'The destination parent is not a safe regular directory.',
  数据管理: 'Data Management',
  '只读诊断、可验证导出和恢复预览': 'Read-only diagnostics, verifiable export, and restore preview',
  '只读诊断、可验证备份恢复与安全治理':
    'Read-only diagnostics, verifiable backup and restore, and safe lifecycle management',
  重新诊断: 'Diagnose again',
  '数据操作未完成。': 'The data operation did not finish.',
  一致性诊断: 'Consistency diagnostics',
  '诊断不会删除、移动、覆盖或修复用户文件。':
    'Diagnostics never delete, move, overwrite, or repair user files.',
  '{count} 个异常': '{count} issues',
  未发现异常: 'No issues found',
  工作区: 'Workspaces',
  模板关系: 'Template relations',
  文件计划: 'File plans',
  文件计划历史列表: 'File plan history list',
  计划记录与撤销: 'Plan records and undo',
  '计划记录在此区域内部滚动；删除采用安全归档。':
    'Plan records scroll inside this region. Delete uses safe archiving.',
  一键删除计划记录: 'Delete archivable plan records',
  '将归档 {count} 份计划：{cancelled} 份已取消，{applied} 份已执行。':
    'Archive {count} plans: {cancelled} cancelled and {applied} applied.',
  '只从普通列表隐藏计划；模板源码、执行记录、撤销备份和用户数据不会删除。':
    'Plans are only hidden from the normal list. Template sources, executions, undo backups, and user data remain.',
  确认删除计划记录: 'Confirm delete plan records',
  删除计划记录: 'Delete plan record',
  一键删除执行记录: 'Delete undone execution records',
  删除执行记录: 'Delete execution record',
  确认删除执行记录: 'Confirm delete execution records',
  '将删除 {count} 条已撤销执行记录。': 'Delete {count} undone execution records.',
  '只删除已撤销的历史记录；模板、题目、关系和源码不变。对应的复制为新计划入口将消失，数据管理统计会同步减少。':
    'Only undone history is deleted. Templates, problems, relations, and source files remain unchanged. The corresponding copy-as-new-plan action disappears, and the Data Management count decreases in sync.',
  '已删除 {count} 条已撤销执行记录；数据管理统计已同步。':
    'Deleted {count} undone execution records. Data Management statistics are now in sync.',
  关闭新建题目: 'Close new problem',
  'AI 已补全草稿：{provider} · {model}。你仍可修改后一次保存。':
    'AI filled the draft with {provider} · {model}. You can still edit it and save once.',
  '手动填写，或在同一窗口中加入图文并请求 AI 补全。':
    'Fill it manually, or add text and images in the same window and ask AI to complete it.',
  'AI 请求已取消，已填写的题目内容和模板选择均已保留。':
    'AI request cancelled. Your problem fields and template selections were preserved.',
  '用户手动选择。': 'Selected manually by the user.',
  结构化分析: 'Structured analysis',
  'AI 图文补全': 'AI text and image completion',
  '使用上方题面与下方图片补全空白字段；失败或取消不会清空你的内容。':
    'Use the statement above and images below to fill blank fields. Failure or cancellation keeps your content.',
  取消分析: 'Cancel analysis',
  重新分析并补全: 'Analyze again and complete',
  'AI 分析并补全': 'Analyze and complete with AI',
  '图片只在最终确认创建后保存。': 'Images are saved only after final creation confirmation.',
  模板关联草稿: 'Template relation drafts',
  '可手动搜索多份模板；AI 建议不会自动保存。':
    'Search and select multiple templates manually. AI suggestions are never saved automatically.',
  搜索本地模板: 'Search local templates',
  '名称、路径或语言': 'Name, path, or language',
  选择本地模板: 'Choose local template',
  '选择模板…': 'Choose a template…',
  添加本地模板关联: 'Add local template relation',
  '尚未选择模板；没有可靠候选时可以保持为空。':
    'No template selected. Leave it empty when there is no reliable candidate.',
  手动选择: 'Manual selection',
  直接解法: 'Direct solution',
  子问题: 'Subproblem',
  前置能力: 'Prerequisite',
  优化方向: 'Optimization',
  替代解法: 'Alternative solution',
  移除模板关联草稿: 'Remove template relation draft',
  '为什么需要这份模板…': 'Why this template is needed…',
  '最终确认后才会原子保存题目、图片和已勾选关系。':
    'The problem, images, and checked relations are saved atomically only after final confirmation.',
  '暂无可归档计划记录。': 'No archivable plan records.',
  '已从普通列表隐藏 {count} 份计划；执行记录、撤销能力和安全备份保持不变。':
    'Hidden {count} plans from the normal list. Executions, undo, and safety backups remain unchanged.',
  重命名或移动模板: 'Rename or move template',
  '只允许移动到当前工作区内；确认前不会写入文件。':
    'Moves are limited to the current workspace. No file is written before confirmation.',
  关闭模板移动窗口: 'Close template move dialog',
  新的文件名与相对路径: 'New file name and relative path',
  '使用工作区内相对路径，并保留原源码扩展名；不会覆盖同名文件。':
    'Use a workspace-relative path and keep the source extension. Existing files are never overwritten.',
  移动预览: 'Move preview',
  仅重命名: 'Rename only',
  仅移动: 'Move only',
  重命名并移动: 'Rename and move',
  题目关联: 'Problem relations',
  '项保持原模板 ID': 'items keep the original template ID',
  保持不变: 'Preserved',
  当前无元数据: 'No metadata yet',
  '执行前会创建安全备份；文件、索引或数据库任一步失败都会恢复原路径。':
    'A safety backup is created first. Any file, index, or database failure restores the original path.',
  '请核对原路径、新路径和受影响数据。': 'Review the original path, new path, and affected data.',
  '先生成只读预览。': 'Generate a read-only preview first.',
  确认重命名或移动: 'Confirm rename or move',
  预览变更: 'Preview change',
  '模板已安全重命名或移动，并保留原有元数据与题目关联':
    'Template renamed or moved safely; metadata and problem relations were preserved.',
  执行记录: 'Execution records',
  '正在诊断本地数据…': 'Diagnosing local data...',
  'SQLite 状态': 'SQLite status',
  quick_check: 'quick_check',
  外键: 'Foreign keys',
  通过: 'Passed',
  失败: 'Failed',
  存在: 'Present',
  不存在: 'Absent',
  空间统计: 'Storage usage',
  用户数据总量: 'Total user data',
  只读发现: 'Read-only findings',
  导出与验证: 'Export and verification',
  '导出包不包含 API Key 或安全存储密钥；Provider 恢复后需要重新填写密钥。':
    'Exported backups do not include API keys or secure-storage key files. Provider keys must be re-entered after restore.',
  包含模板源码副本: 'Include template source copies',
  导出备份: 'Export backup',
  验证备份包: 'Verify backup',
  恢复预览: 'Restore preview',
  '备份已导出并通过校验。': 'Backup exported and verified.',
  导出完成: 'Export complete',
  文件数量: 'Files',
  格式版本: 'Format version',
  备份包校验通过: 'Backup verification passed',
  备份包校验失败: 'Backup verification failed',
  '备份包验证失败，导出已取消。': 'Backup verification failed. Export was cancelled.',
  '备份发布后验证失败，请重新导出。': 'Backup verification failed after publishing. Export again.',
  版本: 'Version',
  恢复预览可继续: 'Restore preview can continue',
  恢复预览存在阻止项: 'Restore preview has blocking items',
  恢复执行确认: 'Restore execution confirmation',
  '恢复前会自动备份当前数据；本版本会跳过模板源码恢复，不会修改外部模板工作区。':
    'The app will back up current data before restore. This version skips template sources and will not modify external template workspaces.',
  '我已确认恢复预览，并允许应用恢复 userData 中的数据副本。':
    'I reviewed the restore preview and allow the app to restore the data copy in userData.',
  确认恢复: 'Confirm restore',
  恢复完成: 'Restore complete',
  '恢复完成。Provider 密钥未恢复，请重新配置密钥。':
    'Restore complete. Provider keys were not restored; reconfigure the keys.',
  '恢复完成。恢复前自动备份已保存。': 'Restore complete. The preflight backup was saved.',
  '备份包包含模板源码副本；本次已按策略跳过。':
    'The backup package contains template source copies; they were skipped by policy.',
  '恢复执行只处理应用 userData 数据；模板源码默认跳过，外部工作区不会被修改。':
    'Restore execution only handles app userData. Template sources are skipped by default, and external workspaces are not modified.',
  '备份包校验未通过，禁止恢复。': 'Backup verification failed. Restore is blocked.',
  '备份包版本不兼容。': 'Backup package version is incompatible.',
  '备份包版本不兼容，无法恢复。': 'Backup package version is incompatible and cannot be restored.',
  '当前版本只支持跳过模板源码恢复。':
    'This version only supports skipping template source restore.',
  '恢复前自动备份验证失败，恢复已取消。':
    'Preflight backup verification failed. Restore was cancelled.',
  '恢复前自动备份发布后验证失败，恢复已取消。':
    'Preflight backup verification failed after publishing. Restore was cancelled.',
  '恢复前自动备份失败，恢复已取消。': 'Preflight backup failed. Restore was cancelled.',
  '模拟恢复失败，已回滚到操作前状态。':
    'Simulated restore failure. Data was rolled back to the pre-operation state.',
  '备份 SQLite 校验未通过，禁止恢复。': 'Backup SQLite verification failed. Restore is blocked.',
  '备份数据库结构与当前版本不兼容，无法恢复。':
    'The backup database structure is incompatible with this version and cannot be restored.',
  '恢复后的 SQLite 校验失败，当前数据已回滚。':
    'Restored SQLite verification failed. Current data was rolled back.',
  'SQLite 恢复失败，当前数据已回滚。': 'SQLite restore failed. Current data was rolled back.',
  '恢复失败，当前数据已回滚到操作前状态。':
    'Restore failed. Current data was rolled back to the pre-operation state.',
  备份题目: 'Backup problems',
  '导出备份失败，临时文件已清理。': 'Backup export failed. Temporary files were cleaned up.',
  '目标备份包已存在，请选择新的导出位置。':
    'The target backup package already exists. Choose a new export location.',
  'SQLite 快照校验失败，导出已取消。': 'SQLite snapshot verification failed. Export was cancelled.',
  '当前版本只开放恢复预览；执行恢复会在导出校验和失败回滚测试稳定后开放。':
    'This version only exposes restore preview. Executing restore will open after export verification and rollback tests are stable.',
  '正在打开数据管理…': 'Opening Data Management...',
  '已批量导入 {count} 份 C++ 模板': 'Imported {count} C++ templates',
  '已填入阿里云北京区域兼容端点；如控制台配置不同，请按实际端点调整。':
    'The Alibaba Cloud Beijing compatible endpoint is prefilled. Adjust it if your console configuration differs.',
  '阿里云百炼 OpenAI 兼容接口，预设 Qwen3 VL Plus 视觉模型。':
    'Alibaba Cloud Model Studio OpenAI-compatible endpoint with the Qwen3 VL Plus visual model preset.',
  '支持文本与视觉输入；可按阿里云控制台实际可用模型调整。':
    'Supports text and visual input. Adjust the model to match availability in the Alibaba Cloud console.',
  '无法读取批量 C++ 源码。': 'Unable to read the selected C++ sources.',
  '无法准备批量 AI 发送预览。': 'Unable to prepare the batch AI request preview.',
  '批量 AI 补全已停止；尚未向工作区写入文件。':
    'Batch AI completion stopped. No files were written to the workspace.',
  '批量 AI 元数据补全未完成；尚未向工作区写入文件。':
    'Batch AI metadata completion did not finish. No files were written to the workspace.',
  '批量导入未完成，请检查目标路径。': 'Batch import did not finish. Check the target paths.',
  '批量导入 C++ 模板': 'Batch import C++ templates',
  '默认全选，可直接导入或按需生成 AI 元数据；确认前不会写入当前工作区。':
    'All sources are selected by default. Import directly or generate AI metadata as needed; nothing is written before confirmation.',
  '读取外部副本，逐份生成 AI 元数据；确认前不会写入当前工作区。':
    'Read external copies and generate AI metadata one by one. Nothing is written before confirmation.',
  关闭批量导入: 'Close batch import',
  '选择多个 C++ 文件': 'Select multiple C++ files',
  '扫描 C++ 文件夹': 'Scan a C++ folder',
  '已选 {selected}/{total} 份 · {characters} 字符':
    '{selected}/{total} selected · {characters} characters',
  '{count} 份源码 · {characters} 字符': '{count} sources · {characters} characters',
  '单批最多 100 份，仅接受 .cpp': 'Up to 100 files per batch; .cpp only',
  '选择待复制的 C++ 源码': 'Select C++ sources to copy',
  '原文件只读；最终会在当前模板工作区创建新的 .cpp 文件。':
    'Original files are read-only. New .cpp files will be created in the current template workspace.',
  工作区保存路径: 'Workspace target path',
  全选: 'Select all',
  取消全选: 'Deselect all',
  '默认全选；取消勾选的源码不会发送给 AI，也不会加入工作区。':
    'All are selected by default. Unchecked sources are neither sent to AI nor added to the workspace.',
  选择导入: 'Select for import',
  无标签: 'No tags',
  '未生成 AI 元数据，将按空元数据导入': 'No AI metadata; import with empty metadata',
  目标路径冲突: 'Target path conflict',
  '本批次中有多个模板使用相同目标路径，请跳过或修改文件名。':
    'Multiple templates in this batch use the same target path. Skip one or change its filename.',
  '目标路径与已有文件仅大小写不同，请跳过或修改文件名。':
    'The target differs from an existing file only by letter case. Skip it or change its filename.',
  '目标路径已被文件夹占用，请跳过或修改文件名。':
    'A folder occupies the target path. Skip it or change its filename.',
  '目标文件已经存在，请选择覆盖、不加入或修改文件名。':
    'The target file already exists. Choose overwrite, exclude, or change the filename.',
  '目标路径不是可覆盖的普通文件，请跳过或修改文件名。':
    'The target is not a regular file that can be overwritten. Skip it or change its filename.',
  已有路径: 'Existing path',
  不加入: 'Do not add',
  修改文件名: 'Change filename',
  覆盖已有文件: 'Overwrite existing file',
  '检测到 {count} 项路径冲突，请逐项选择处理方式。':
    '{count} path conflicts found. Choose how to handle each item.',
  批量补全语言: 'Batch completion language',
  '正在补全 {completed}/{total}': 'Completing {completed}/{total}',
  停止后续补全: 'Stop remaining completion',
  重新生成全部元数据: 'Regenerate all metadata',
  重新生成所选元数据: 'Regenerate selected metadata',
  'AI 批量补全': 'Batch AI completion',
  'AI 补全所选模板': 'Complete selected templates with AI',
  '确认导入 {count} 份': 'Import {count} files',
  '批量导入 C++': 'Batch import C++',
  '批量导入只接受普通 .cpp 文件。': 'Batch import only accepts regular .cpp files.',
  '每份 C++ 源码必须是小于 2 MiB 的非空文件。':
    'Each C++ source must be a non-empty file smaller than 2 MiB.',
  '单批 C++ 源码总大小不能超过 20 MiB。':
    'The total C++ source size in one batch cannot exceed 20 MiB.',
  '无法读取所选 C++ 源码文件夹。': 'Unable to read the selected C++ source folder.',
  '批量扫描位置必须是普通文件夹。': 'The batch scan location must be a regular folder.',
  '目录层级超过 32 层，已停止继续扫描。':
    'Scanning stopped because the directory depth exceeds 32 levels.',
  '所选文件夹中没有可导入的 .cpp 文件。': 'The selected folder contains no importable .cpp files.',
  '批量导入只接受 .cpp 文件。': 'Batch import only accepts .cpp files.',
  '批量导入备份目录未初始化。': 'The batch-import backup directory is unavailable.',
  '目标路径与已有文件仅大小写不同：':
    'The target path differs from an existing file only by letter case:',
  '待覆盖文件状态已变化，请重新检查：':
    'The file selected for overwrite has changed. Check it again:',
  '待覆盖文件内容已变化，请重新确认：':
    'The file selected for overwrite changed. Confirm it again:',
  '待覆盖文件状态已变化，请重新选择处理方式。':
    'The file selected for overwrite changed. Choose how to handle it again.',
  '目标路径不能覆盖：': 'The target path cannot be overwritten:',
  '目标路径状态已变化，请重新检查后再导入。':
    'The target path changed. Check conflicts again before importing.',
  '批量导入失败，已恢复覆盖文件并移除新文件。':
    'Batch import failed. Overwritten files were restored and new files were removed.',
  '批量导入失败，部分覆盖文件无法自动恢复；安全备份已保留，请停止编辑并检查工作区。':
    'Batch import failed and some overwritten files could not be restored automatically. A safety backup was retained; stop editing and inspect the workspace.',
  '批量文件已创建，但索引更新失败。': 'The batch files were created, but the index update failed.',
  '目标路径已存在，批量导入未写入。':
    'A target path already exists. Nothing from the batch was imported.',
  '批量导入失败，已移除本批创建的文件。':
    'Batch import failed. Files created by this batch were removed.',
  '批量 C++ 源码': 'Batch C++ sources',
  写入方式: 'Write behavior',
  本地数据保护: 'Local data protection',
  只在确认最终导入后向当前工作区创建新副本:
    'Create new copies in the current workspace only after final confirmation',
  '外部源文件、API Key、绝对路径和用户笔记不会被修改或发送':
    'External source files, API keys, absolute paths, and user notes are neither modified nor sent',
  'AI 请求已取消。': 'The AI request was cancelled.',
  'AI 返回的英文文件计划中仍包含中文或其他东亚文字，请重试或更换模型。':
    'The English file plan still contains Chinese or other East Asian text. Try again or switch models.',
  'AI 返回的文件计划未遵循中文命名与说明规则，请重试。':
    'The file plan did not follow the Chinese naming and description rules. Try again.',
  '该 AI 文件计划请求已在运行。': 'This AI file-plan request is already running.',
  '当前没有可导出的 AI 文件计划诊断。': 'There is no AI file-plan diagnostic to export.',
  取消生成: 'Cancel generation',
  本地审计: 'Local audit',
  高风险: 'High risk',
  中风险: 'Medium risk',
  低风险: 'Low risk',
  '安全诊断已导出；不包含路径、源码、笔记或密钥。':
    'The safe diagnostic was exported without paths, source code, notes, or secrets.',
  '正在分析审计结果、工作区分类和相关源码；可以随时取消。':
    'Analyzing audit results, workspace categories, and related source. You can cancel at any time.',
  导出安全诊断: 'Export safe diagnostic',
  需手动选择: 'Manual selection required',
  证据: 'Evidence',
  置信度: 'Confidence',
  备选方案: 'Alternatives',
  安全诊断: 'Safe diagnostic',
  'AI 仅接收路径、元数据和受限源码片段；文件操作始终需要二次确认':
    'AI receives only paths, metadata, and limited source snippets. File operations always require confirmation.',
  'AI 元数据补全未完成。': 'AI metadata completion did not finish.',
  'AI 分析题目': 'Analyze problem with AI',
  'AI 已生成 {count} 项可审查操作，尚未修改文件。':
    'AI generated {count} reviewable operations. No files were changed.',
  'AI 建议': 'AI suggestion',
  'AI 建议与已填写内容不同。默认保留你的内容，请逐项确认后再合并。':
    'AI suggestions differ from your entries. Your content is kept by default; review each field before merging.',
  'AI 没有找到可靠的本地模板候选。': 'AI found no reliable local template candidates.',
  'AI 没有生成通过本地安全校验的操作。可取消本计划后重试。':
    'AI generated no operations that passed local safety checks. Cancel this plan and try again.',
  'AI 草稿平台': 'AI draft platform',
  'AI 草稿本地备注': 'AI draft local notes',
  'AI 草稿标签': 'AI draft tags',
  'AI 草稿状态': 'AI draft status',
  'AI 草稿链接': 'AI draft URL',
  'AI 草稿难度': 'AI draft difficulty',
  'AI 草稿题号': 'AI draft problem ID',
  'AI 草稿题目标题': 'AI draft title',
  'AI 草稿题面摘要': 'AI draft statement summary',
  'AI 补全路径与元数据': 'AI path & metadata completion',
  'API Key 仍由你填写': 'You still provide the API key',
  'Provider 协议': 'Provider protocol',
  'Provider 只声明连接方式与能力。题目分析和文件管理将在任务路由确认后使用它。':
    'A provider defines connectivity and capabilities. Problem analysis and file management use it only after task routing is configured.',
  'Provider 显示名称': 'Provider display name',
  'Provider 配置': 'Provider profiles',
  '{message} 延迟 {latency} ms。': '{message} Latency: {latency} ms.',
  个匹配结果: 'matches',
  个将写入: 'to be saved',
  个已确认关联: 'confirmed relations',
  个配置: 'profiles',
  '云端服务必须使用 HTTPS；Ollama 可连接 localhost。':
    'Cloud services must use HTTPS; Ollama may connect to localhost.',
  '仅保留你确认的候选；创建后仍可手动调整。':
    'Only confirmed candidates are kept. You can edit them after creation.',
  仅写入系统安全存储: 'Stored only in OS secure storage',
  从备份撤销: 'Undo from backup',
  '从左侧模板树打开源码；搜索结果也会自动定位并展开对应目录。':
    'Open source from the template tree. Search results locate and expand their folders.',
  代码主题: 'Code theme',
  代码查看器工具栏: 'Code viewer toolbar',
  任务路由: 'Task routing',
  '使用 JSON 对象；鉴权与传输敏感头由应用管理，不能覆盖。':
    'Use a JSON object. Authentication and sensitive transport headers are managed by the app and cannot be overridden.',
  '使用逗号分隔，最多 20 个标签。': 'Separate with commas; up to 20 tags.',
  使用预设: 'Use preset',
  '例如 最短路计数': 'For example, Shortest Path Count',
  '例如：我的 OpenAI': 'For example: My OpenAI',
  '例如：本题实际使用了该模板的堆优化版本。':
    'For example: This problem uses the heap-optimized version.',
  供应商快捷预设: 'Provider presets',
  保存元数据: 'Save metadata',
  保存关联: 'Save relation',
  候选模板关联: 'Candidate template relations',
  先连接模板工作区: 'Connect a template workspace first',
  '全部使用 AI': 'Use AI for all',
  全部保留我的: 'Keep all of mine',
  '共 {count} 个冲突字段': '{count} conflicting fields',
  关系类型: 'Relation type',
  关联备注: 'Relation note',
  关联模板: 'Related templates',
  关联题目: 'Related problems',
  '关闭 AI 提示': 'Dismiss AI message',
  '关闭 AI 题目分析': 'Close AI problem analysis',
  关闭元数据冲突确认: 'Close metadata conflict review',
  关闭关联编辑器: 'Close relation editor',
  关闭分析错误: 'Dismiss analysis error',
  关闭文件管理提示: 'Dismiss file management message',
  关闭新建模板: 'Close new template dialog',
  关闭题目编辑器: 'Close problem editor',
  关闭题目错误提示: 'Dismiss problem error',
  分析图片: 'Analysis images',
  '创建前不会写入文件；同名文件永远不会被覆盖。':
    'No file is written before creation; existing files are never overwritten.',
  创建前草稿: 'Pre-creation draft',
  创建第一道题: 'Create the first problem',
  删除后任务路由也会移除: 'Task routes will also be removed',
  删除模板: 'Delete template',
  删除配置: 'Delete profile',
  删除题目: 'Delete problem',
  '勾选要执行的项目，未选项目不会写入。':
    'Select the operations to run. Unselected operations are not written.',
  协议: 'Protocol',
  单张: 'each',
  '单次题目分析最多添加 6 张图片。': 'A problem analysis can include at most 6 images.',
  '发送前会显示当前任务 Provider；分析不会自动创建题目。':
    'The current task provider is shown before sending. Analysis never creates a problem automatically.',
  取消: 'Cancel',
  取消计划: 'Cancel plan',
  '只要已有源码即可使用；冲突内容不会被静默覆盖。':
    'Source code is enough to start. Conflicting content is never silently overwritten.',
  只读审计: 'Read-only audit',
  '只读扫描完成：发现 {count} 项建议。': 'Read-only scan complete: {count} suggestions.',
  '只读查看 · 可切换 VS Code 主题': 'Read-only · switchable VS Code themes',
  '只负责供应商、密钥、模型能力与任务路由；不会在此执行 AI 管理任务':
    'Manage providers, keys, model capabilities, and task routes here. AI tasks do not run on this page.',
  '可先配置云端服务或本机 Ollama。': 'Configure a cloud service or local Ollama.',
  '可手动填写，也可让 AI 补全空白字段。': 'Fill fields manually or let AI complete blank fields.',
  '可暂空，例如 图论/最短路/dijkstra.cpp': 'Optional, e.g. Graph Theory/Shortest Path/dijkstra.cpp',
  合计: 'total',
  '图片只用于本次分析，确认草稿后才会保存。':
    'Images are used only for this analysis and saved only after you confirm the draft.',
  在文件管理器中显示: 'Show in file manager',
  复制为新计划: 'Copy as new plan',
  复制源码: 'Copy source',
  复制相对路径: 'Copy relative path',
  复杂度: 'Complexity',
  导入源码文件: 'Import source file',
  '将 <WorkspaceId> 替换为百炼工作空间 ID；其他地域请使用控制台给出的兼容端点。':
    'Replace <WorkspaceId> with the Bailian workspace ID. For other regions, use the compatibility endpoint from the console.',
  '将删除题目、图片与关联': 'Problem, images, and relations will be deleted',
  '将备份后执行 {count} 项操作': 'Back up and run {count} operations',
  '尚未关联模板。你可以从当前工作区选择一个或多个算法模板。':
    'No templates linked yet. Choose one or more templates from the current workspace.',
  尚未扫描: 'Not scanned yet',
  '尚未添加本地备注。': 'No local notes yet.',
  '尚未补充平台、题号和难度': 'Platform, problem ID, and difficulty not set',
  '尚未记录题面摘要。': 'No statement summary yet.',
  工作区文件: 'Workspace files',
  '已从备份撤销文件计划。': 'File plan undone from backup.',
  已取消计划: 'Cancelled plans',
  '已合并 {provider} · {model} 的建议，可继续编辑。':
    'Merged suggestions from {provider} · {model}. You can keep editing.',
  '已执行 {count} 项操作，并保留撤销备份。':
    'Applied {count} operations and retained an undo backup.',
  '已重新校验并创建 {count} 项新草稿；旧计划记录保持不变。':
    'Revalidated and created {count} new draft operations. The old plan remains unchanged.',
  平台: 'Platform',
  '建议先运行只读扫描，再请求 AI 生成计划。':
    'Run a read-only scan before asking AI to generate a plan.',
  张: 'images',
  当前协议: 'Current protocol',
  当前题目: 'Current problem',
  待分析题面: 'Problem statement to analyze',
  待确认变更计划: 'Pending change plan',
  '总体文件 AI 管理': 'Workspace File AI Management',
  我的内容: 'My content',
  '所有内容默认只保存在本机。': 'All content is stored locally by default.',
  执行与撤销: 'Execution & undo',
  '按实际模型能力声明，任务路由会在调用前检查。':
    'Declare actual model capabilities. Task routing checks them before calls.',
  按最近修改排序: 'Sorted by recent changes',
  '搜索标题、题号或标签': 'Search title, problem ID, or tags',
  '支持 PNG、JPEG、WebP，单张最大 8 MiB。': 'Supports PNG, JPEG, and WebP up to 8 MiB each.',
  '支持纯文本、截图，或在文本框内按 Cmd/Ctrl+V 粘贴图片。':
    'Supports text, screenshots, or pasted images with Cmd/Ctrl+V.',
  '文件 AI 管理只处理用户明确授权的当前工作区；Provider 配置仍可独立使用。':
    'File AI Management only handles the authorized workspace. Provider settings remain independently available.',
  '文件名 / 保存路径': 'File name / save path',
  文件大小: 'File size',
  文件类型: 'File type',
  新建题目: 'New problem',
  无: 'None',
  '无法读取源码文件。': 'Unable to read the source file.',
  时间复杂度: 'Time complexity',
  显示名称: 'Display name',
  暂不合并: 'Not now',
  '暂无文件执行记录。': 'No file execution history.',
  更换目录: 'Change folder',
  '未发现确定性问题。': 'No deterministic issues found.',
  未填写: 'Not provided',
  未知: 'Unknown',
  未设置平台: 'Platform not set',
  本地保存: 'stored locally',
  本地备注: 'Local notes',
  本地题库与模板关联: 'Local problem library and template relations',
  '本机 Ollama 通常无需填写': 'Local Ollama usually needs no key',
  来源链接: 'Source URL',
  '查看题面、备注、图片和关联模板；解除关联不会影响两侧数据。':
    'View the statement, notes, images, and template relations. Unlinking preserves both records.',
  标签: 'Tags',
  模型名称: 'Model ID',
  模型能力: 'Model capabilities',
  模板代码查看器: 'Template code viewer',
  '模板当前不可用，关联已保留': 'Template unavailable; relation retained',
  模板摘要: 'Template summary',
  模板时间复杂度: 'Template time complexity',
  模板标签: 'Template tags',
  模板树: 'Template tree',
  模板空间复杂度: 'Template space complexity',
  '正在准备源码查看器…': 'Preparing source viewer…',
  '正在读取 AI Provider…': 'Reading AI providers…',
  测试连接: 'Test connection',
  '添加 Provider': 'Add provider',
  添加关联: 'Add relation',
  添加图片: 'Add images',
  源文件将备份后删除: 'Source file will be backed up, then deleted',
  源码与保存路径: 'Source & save path',
  '源码可直接使用；元数据是可选增强，不影响离线查询。':
    'Source works without metadata. Metadata is optional and does not affect offline browsing.',
  源码读取失败: 'Failed to read source',
  状态: 'Status',
  '生成 AI 计划': 'Generate AI plan',
  '允许发送模板用户笔记': 'Allow sending template notes',
  '生成失败不会创建计划或修改文件。若问题与模型、鉴权或格式有关，请前往 AI 设置检查任务路由和模型能力。':
    'A failed generation creates no plan and changes no files. Check task routing and capabilities in AI Settings.',
  生成草稿: 'Generate draft',
  '由 {provider} · {model} 生成，确认前不会写入题库。':
    'Generated by {provider} · {model}. Nothing enters the library before confirmation.',
  确认删除: 'Confirm delete',
  '确认后才会保存题目、{count} 张图片和关联。':
    'Confirmation saves the problem, {count} images, and relations.',
  确认执行: 'Confirm execution',
  确认撤销: 'Confirm undo',
  确认解除: 'Confirm unlink',
  移除分析图片: 'Remove analysis image',
  空间复杂度: 'Space complexity',
  筛选模板树: 'Filter template tree',
  筛选题目卡片: 'Filter problem cards',
  算法信息: 'Algorithm details',
  算法元数据: 'Algorithm metadata',
  '粘贴或输入模板源码…': 'Paste or type template source…',
  '粘贴源码即可请求 AI；所有元数据都能在写入前编辑和确认。':
    'Paste source to request AI. Edit and confirm all metadata before writing.',
  '粘贴题目描述、输入输出与数据范围…': 'Paste the statement, input/output, and constraints…',
  '精确填写服务商模型 ID': 'Enter the exact provider model ID',
  精细分类: 'Detailed classification',
  编辑与模板的关联: 'Edit relation with template',
  '自动填写官方兼容协议和推荐模型，保存前仍可修改。':
    'Fill the official compatible protocol and recommended model; edit before saving.',
  自定义请求头: 'Custom headers',
  '自定义请求头格式无效。': 'Invalid custom headers.',
  行: 'lines',
  解除与模板的关联: 'Unlink template',
  '解除关联不会删除题目、模板或源码。':
    'Unlinking does not delete the problem, template, or source.',
  '计划已取消，工作区文件未发生变化。': 'Plan cancelled. Workspace files were unchanged.',
  '记录思路、错误原因或复盘…': 'Record ideas, mistakes, or review notes…',
  '记录题意、输入输出和关键约束…': 'Record the statement, I/O, and key constraints…',
  设置关联: 'Set relations',
  '语言选择会约束分类目录、文件名、标签与说明字段；源码语言、扩展名和复杂度表达保持不变。':
    'The selected language controls category folders, file names, tags, and descriptions. Source language, extension, and complexity notation stay unchanged.',
  超时时间: 'Timeout',
  '超时时间必须是数字。': 'Timeout must be numeric.',
  '超时时间（秒）': 'Timeout (seconds)',
  '路径可以暂时留空，AI 会根据源码建议文件名与分类。':
    'Leave the path blank and AI can suggest a file name and classification from source.',
  '输入题面、选择截图或直接粘贴图片；分析结果仅形成可编辑草稿。':
    'Enter a statement, choose screenshots, or paste images. Analysis only creates an editable draft.',
  返回: 'Back',
  返回修改输入: 'Back to input',
  '还没有 AI Provider': 'No AI providers yet',
  '还没有题目使用该模板。点击“设置关联”即可从题库中添加。':
    'No problems use this template yet. Select Set relations to add one.',
  '连接一个 AI 服务': 'Connect an AI service',
  选择一道题目: 'Select a problem',
  选择候选模板: 'Select candidate template',
  选择截图: 'Choose screenshots',
  选择操作: 'Select operation',
  重新扫描工作区: 'Rescan workspace',
  重新读取源码: 'Reload source',
  重试: 'Retry',
  难度: 'Difficulty',
  项: 'items',
  预览并执行: 'Preview & execute',
  题号: 'Problem ID',
  题目列表: 'Problem list',
  '题目和备注保存在本地数据库；模板关联可在保存后继续编辑。':
    'Problems and notes stay in the local database. Edit template relations after saving.',
  题目图片: 'Problem images',
  题目标题: 'Problem title',
  题目索引: 'Problem index',
  题目链接: 'Problem URL',
  题面与备注: 'Statement & notes',
  题面摘要: 'Statement summary',
  题面输入: 'Statement input',
  '（留空则保留现有密钥）': '(leave blank to keep the existing key)',
  '// 空模板文件': '// Empty template file',
  '仅支持 PNG、JPEG 或 WebP 图片。': 'Only PNG, JPEG, and WebP images are supported.',
  关闭图片预览: 'Close image preview',
  关闭题目关联设置: 'Close problem relation settings',
  '图论, 最短路, Dijkstra': 'Graph Theory, Shortest Path, Dijkstra',
  '将“{name}”关联到一道已有题目；题目和模板都不会被复制或移动。':
    'Link “{name}” to an existing problem. Neither the problem nor the template will be copied or moved.',
  '当前题库中的题目都已经关联到该模板。你可以在下方的关联题目卡片中打开题目，修改关系类型或解除关联。':
    'Every problem in the library is already linked to this template. Open a related problem below to change or remove the relation.',
  '按宽度查看可上下滚动完整长图，也可切换为适合窗口；按 Escape 关闭预览。':
    'Fit the image to the preview width and scroll through a tall image, or fit the whole image to the window. Press Escape to close.',
  '无法读取粘贴的图片。': 'Unable to read the pasted image.',
  '普及+/提高、1600…': 'Easy/Intermediate, 1600…',
  '最短路, 图论, Dijkstra': 'Shortest Path, Graph Theory, Dijkstra',
  '洛谷、Codeforces…': 'Luogu, Codeforces…',
  确认: 'Confirm',
  粘贴图片: 'Pasted image',
  移除图片: 'Remove image',
  '自定义请求头必须是 JSON 对象。': 'Custom headers must be a JSON object.',
  '自定义请求头的值必须全部是字符串。': 'Every custom-header value must be a string.',
  选择题目: 'Select a problem',
  预览图片: 'Preview image',
  '预览题目图片：{name}': 'Preview problem image: {name}',
  图片预览方式: 'Image preview mode',
  按宽度查看: 'Fit width',
  适合窗口: 'Fit window',
  题目图片滚动预览: 'Scrollable problem image preview',
  高亮模板源码: 'Highlighted template source',
  '单张题目图片不能超过 8 MiB。': 'Each problem image must be no larger than 8 MiB.',
  '操作未完成，请重试。': 'The operation did not finish. Please try again.',
  '例如：本题实际使用该模板作为基础实现。':
    'For example: This problem uses the template as its base implementation.',
  '官方 OpenAI 兼容接口，适合文本分析、模板元数据和文件计划。':
    'Official OpenAI-compatible API for text analysis, template metadata, and file plans.',
  '可改为 deepseek-v4-pro；旧 deepseek-chat 即将弃用。':
    'You can switch to deepseek-v4-pro; the legacy deepseek-chat model will be retired soon.',
  '阿里云百炼 OpenAI 兼容接口；中国大陆端点需要工作空间 ID。':
    'Alibaba Cloud Bailian OpenAI-compatible API; mainland China endpoints require a workspace ID.',
  '需要视觉时请换用支持图片的千问模型，并勾选视觉输入。':
    'For vision tasks, choose an image-capable Qwen model and enable Vision input.',
  阿里云百炼: 'Alibaba Cloud Bailian',
  中: 'ZH',
  题目图片分析: 'Problem image analysis',
  'Provider 已安全保存。': 'Provider saved securely.',
  'Provider 配置已更新。': 'Provider updated.',
  新配置: 'New configuration',
  配置详情: 'Configuration details',
  密钥已保存: 'Key saved',
  无密钥: 'No key',
  视觉输入: 'Vision input',
  结构化输出: 'Structured output',
  流式输出: 'Streaming output',
  当前路由: 'Current route',
  需要视觉能力: 'Vision capability required',
  设为当前路由: 'Set as current route',
  '保存 Provider': 'Save provider',
  保存更改: 'Save changes',
  '移动 / 重命名': 'Move / rename',
  删除重复文件: 'Delete duplicate file',
  更新算法元数据: 'Update algorithm metadata',
  已执行: 'Applied',
  已撤销: 'Undone',
  '确认 AI 题目草稿': 'Review AI problem draft',
  保存修改: 'Save changes',
  创建题目: 'Create problem',
  尝试中: 'In progress',
  已解决: 'Solved',
  未开始: 'Not started',
  备选: 'Alternative',
  推荐: 'Recommended',
  实际使用: 'Used',
  没有匹配题目: 'No matching problems',
  '尝试缩短关键词。': 'Try a shorter search term.',
  '手动创建第一道题，不需要配置 AI。': 'Create your first problem manually without configuring AI.',
  编辑模板关联: 'Edit template relation',
  关联算法模板: 'Link algorithm template',
  跟随应用: 'Follow app theme',
  退出代码专注模式: 'Exit code focus mode',
  进入代码专注模式: 'Enter code focus mode',
  '退出专注模式（Esc）': 'Exit focus mode (Esc)',
  专注模式: 'Focus mode',
  解决的问题: 'Problem solved',
  '描述这份模板解决的核心问题…': 'Describe the core problem this template solves…',
  适用约束: 'Applicable constraints',
  '适用的数据范围、边权或输入条件…': 'Data ranges, edge weights, or input conditions…',
  前置条件: 'Prerequisites',
  '需要掌握的数据结构或算法概念…': 'Required data structures or algorithm concepts…',
  常见错误: 'Common mistakes',
  '容易写错或遗漏的边界条件…': 'Error-prone or commonly missed edge cases…',
  模板用户笔记: 'Template notes',
  '仅保存在本机的个人备注…': 'Personal notes stored only on this device…',
  取消编辑: 'Cancel editing',
  补充元数据: 'Add metadata',
  用户笔记: 'User notes',
  保存路径: 'Save path',
  没有匹配模板: 'No matching templates',
  工作区还是空的: 'The workspace is empty',
  '使用右上角“新建模板”添加第一份源码。':
    'Use New template in the top-right corner to add your first source file.',
  '无法读取元数据。': 'Unable to read metadata.',
  '无法保存模板元数据。': 'Unable to save template metadata.',
  '无法读取模板源码。': 'Unable to read template source.',
  '连接成功，模型返回了有效文本。': 'Connection successful. The model returned valid text.',
  缺失元数据: 'Missing metadata',
  命名异常: 'Naming issue',
  空文件: 'Empty file',
  完全重复: 'Exact duplicate',
  高度相似: 'Highly similar',
  失效关联: 'Stale relation',
  '算法卡片尚未补充结构化元数据。': 'The algorithm card does not have structured metadata yet.',
  '文件名可能包含副本标记或不一致空格，建议人工确认命名。':
    'The file name may contain a copy marker or inconsistent spaces. Review it manually.',
  '模板文件为空。': 'The template file is empty.',
  '这些模板源码规范化后完全相同；建议仅保留 {path}。':
    'These templates are identical after normalization. Keep only {path}.',
  '这些模板源码高度相似；建议仅保留 {path}，执行前请查看源码确认。':
    'These templates are highly similar. Consider keeping only {path}; inspect the source before applying changes.',
  '模板关联指向当前不可用的模板。':
    'The relation points to a template that is currently unavailable.',
  '所选位置不是可用的文件夹。': 'The selected location is not an available folder.',
  '无法访问该模板工作区，请重新选择。':
    'Unable to access this template workspace. Choose it again.',
  '文件不在当前授权的模板工作区内。':
    'The file is outside the currently authorized template workspace.',
  '符号链接文件不能作为模板打开。': 'Symbolic links cannot be opened as templates.',
  '模板文件当前不可用。': 'The template file is currently unavailable.',
  '模板文件当前不可用，可能已被移动或删除。':
    'The template file is unavailable and may have been moved or deleted.',
  '密钥引用无效，请重新输入 API Key。': 'The key reference is invalid. Enter the API key again.',
  '无法读取已保存密钥，请重新输入 API Key。':
    'Unable to read the saved key. Enter the API key again.',
  'API Key 不能为空。': 'API key cannot be empty.',
  '系统安全存储不可用，未保存 API Key。请先启用系统密钥环。':
    'Secure system storage is unavailable, so the API key was not saved. Enable the system keychain first.',
  '无法安全保存 API Key，请重试。': 'Unable to store the API key securely. Try again.',
  '模板保存路径必须是工作区内的相对路径。':
    'The template save path must be relative to the workspace.',
  '模板保存路径包含无效目录。': 'The template save path contains an invalid directory.',
  '文件扩展名不受支持，请使用常见源码扩展名。':
    'This file extension is unsupported. Use a common source-code extension.',
  'AI 服务响应过大，已停止读取。': 'The AI response was too large, so reading was stopped.',
  'AI 服务返回了无法识别的流式响应。':
    'The AI service returned an unrecognized streaming response.',
  'AI 服务返回了无法识别的响应格式。': 'The AI service returned an unrecognized response format.',
  'AI 请求超时，请检查接口地址或增大超时时间。':
    'The AI request timed out. Check the endpoint or increase the timeout.',
  '无法连接 AI 服务，请检查接口地址和网络。':
    'Unable to connect to the AI service. Check the endpoint and network.',
  '鉴权失败，请检查 API Key 和自定义请求头。':
    'Authentication failed. Check the API key and custom headers.',
  '接口或模型不存在，请核对 Base URL 和模型名称。':
    'The endpoint or model was not found. Verify the Base URL and model ID.',
  '请求受到限流，请稍后重试或更换模型。':
    'The request was rate-limited. Try again later or choose another model.',
  '该 Provider 尚未保存 API Key。': 'This provider does not have a saved API key.',
  'AI 服务没有返回可读取的正文。若使用推理模型，请增大输出长度或改用支持 JSON 输出的非推理模型；也请核对补全协议。':
    'The AI service returned no readable text. Increase the output limit, use a non-reasoning model with JSON output, and verify the completion protocol.',
  'Base URL 格式无效。': 'The Base URL is invalid.',
  'Base URL 不能包含凭据、查询参数或片段。':
    'The Base URL cannot contain credentials, query parameters, or fragments.',
  'Base URL 必须使用 HTTPS；Ollama 可使用本机 loopback HTTP。':
    'The Base URL must use HTTPS. Ollama may use local loopback HTTP.',
  '自定义请求头不能包含换行符。': 'Custom headers cannot contain line breaks.',
  'Provider 不存在或已删除。': 'The provider does not exist or has been deleted.',
  '尚未为此任务选择 AI Provider，请先前往 AI 设置配置任务路由。':
    'No AI provider is assigned to this task. Configure task routing in AI Settings first.',
  '当前任务模型不支持图片输入。': 'The model assigned to this task does not support images.',
  '题目图片分析必须选择支持视觉的模型。': 'Problem image analysis requires a vision-capable model.',
  '题目图片数据格式无效。': 'The problem image data format is invalid.',
  '单张题目分析图片不能超过 8 MiB。': 'Each analysis image must be no larger than 8 MiB.',
  '图片内容与声明格式不一致。': 'The image content does not match its declared format.',
  '题目分析图片合计不能超过 24 MiB。': 'Analysis images cannot exceed 24 MiB in total.',
  '所选图片不可读取或超过 8 MiB。': 'A selected image is unreadable or larger than 8 MiB.',
  '仅支持真实的 PNG、JPEG 或 WebP 图片。': 'Only valid PNG, JPEG, and WebP images are supported.',
  '所选图片不可读取，请重新选择。': 'A selected image is unreadable. Choose it again.',
  'AI 返回的题目草稿不是有效 JSON，请重试。': 'The AI problem draft is not valid JSON. Try again.',
  'AI 返回的题目草稿字段不完整，请重试。':
    'The AI problem draft is missing required fields. Try again.',
  'AI 返回了无效题目字段，请修改输入后重试。':
    'The AI returned invalid problem fields. Revise the input and try again.',
  '候选模板已不可用，请重新分析或取消该关联。':
    'A candidate template is no longer available. Analyze again or remove the relation.',
  '无法保存 AI 题目草稿，未写入任何数据。':
    'Unable to save the AI problem draft. No data was written.',
  '无法保存题目图片，请重试。': 'Unable to save the problem image. Try again.',
  '题目图片目录无效，已停止删除。': 'The problem image directory is invalid. Deletion was stopped.',
  '无法隔离题目图片，题目尚未删除。':
    'Unable to isolate the problem images. The problem was not deleted.',
  '题目卡片不存在或已经被移除。': 'The problem card does not exist or has been removed.',
  '题目图片不存在或记录无效。': 'The problem image does not exist or its record is invalid.',
  '题目图片超过 8 MiB，无法显示。':
    'The problem image is larger than 8 MiB and cannot be displayed.',
  '题目图片内容与记录不一致。': 'The problem image content does not match its record.',
  '题目图片不存在或已经移除。': 'The problem image does not exist or has been removed.',
  '无法暂存待移除图片，请重试。': 'Unable to stage the image for removal. Try again.',
  '该题目与模板之间没有可解除的关联。':
    'There is no removable relation between this problem and template.',
  '所选模板当前不可用，请重新扫描工作区。':
    'The selected template is unavailable. Rescan the workspace.',
  '题目图片记录不在受控目录内。': 'The problem image record is outside the managed directory.',
  'AI 返回的英文元数据中仍包含中文或其他东亚文字，请重试或更换模型。':
    'The English metadata still contains CJK text. Try again or choose another model.',
  'AI 未使用中文生成主要分类目录，请重试。':
    'The AI did not generate the primary categories in Chinese. Try again.',
  'AI 返回的中文分类路径中包含非惯用英文名称，请重试。':
    'The Chinese category path contains a non-conventional English name. Try again.',
  'AI 未使用中文或惯用算法专名生成文件名，请重试。':
    'The AI did not use Chinese or a conventional algorithm name for the file name. Try again.',
  'AI 返回的标签未使用中文或惯用算法专名，请重试。':
    'The AI returned tags that are neither Chinese nor conventional algorithm names. Try again.',
  'AI 返回的说明字段与中文选项不一致，请重试。':
    'The AI description fields do not match the selected Chinese language. Try again.',
  'AI 返回的分类或文件名包含无效路径字符。':
    'The AI category or file name contains invalid path characters.',
  'AI 连续两次未返回可读取的文件计划。工作区未被修改；请在 AI 设置中换用支持结构化输出的模型，或检查模型输出长度。':
    'The AI failed twice to return a readable file plan. The workspace was unchanged. Choose a structured-output model or check its output limit.',
  '文件计划不存在或已结束。': 'The file plan does not exist or has ended.',
  '模板不存在或需要重新扫描。':
    'The template does not exist or the workspace needs to be rescanned.',
  '无法创建模板删除计划。': 'Unable to create the template deletion plan.',
  '原文件计划不存在或不属于当前工作区。':
    'The original file plan does not exist or belongs to another workspace.',
  '只有已取消或已回滚的计划可以重新草拟。': 'Only cancelled or rolled-back plans can be redrafted.',
  '请先处理当前待确认计划，再重新草拟历史计划。':
    'Resolve the current pending plan before redrafting a previous plan.',
  '当前文件状态下没有可重新草拟的有效操作。':
    'There are no valid operations to redraft for the current file state.',
  '文件计划不存在、已结束或不属于当前工作区。':
    'The file plan does not exist, has ended, or belongs to another workspace.',
  '选择的计划操作无效。': 'The selected plan operations are invalid.',
  '文件计划执行失败，已恢复完成的步骤。': 'The file plan failed. Completed steps were restored.',
  '该执行记录不可撤销。': 'This execution record cannot be undone.',
  '执行记录损坏，无法安全撤销。': 'The execution record is damaged and cannot be undone safely.',
  '只有当前工作区中已撤销的执行记录可以删除；仍可撤销的记录请先从备份撤销。':
    'Only undone execution records in the current workspace can be deleted. Undo records that still have a backup first.',
  '执行记录删除失败，所有记录均保持原状。':
    'Execution record deletion failed. All records remain unchanged.',
  '撤销未完成，已恢复到撤销前状态。': 'Undo did not finish. The pre-undo state was restored.',
  '模板源码必须是小于 2 MiB 的普通文件。':
    'Template source must be a regular file smaller than 2 MiB.',
  '所选文件不是支持的源码类型。': 'The selected file is not a supported source type.',
  '所选文件不是可读取的文本源码。': 'The selected file is not readable text source.',
  '无法读取所选源码文件。': 'Unable to read the selected source file.',
  'AI 返回的模板分类不是有效 JSON，请换用支持结构化输出的模型后重试。':
    'The AI template classification is not valid JSON. Choose a structured-output model and try again.',
  'AI 返回的模板分类字段无效，请重试。':
    'The AI returned invalid template-classification fields. Try again.',
  'AI 建议的源码扩展名不受支持，已拒绝该分类。':
    'The AI suggested an unsupported source extension, so the classification was rejected.',
  'AI 建议改变了源码扩展名，已拒绝该分类。':
    'The AI tried to change the source extension, so the classification was rejected.',
  '无法读取该模板工作区，请检查文件夹权限。':
    'Unable to read the template workspace. Check folder permissions.',
  '后台任务已取消。': 'The background task was cancelled.',
  '后台任务失败，请重试。': 'The background task failed. Try again.',
  '后台任务不存在或已经过期。': 'The background task does not exist or has expired.',
  '扫描期间文件状态发生变化，请重试。': 'A file changed state during the scan. Run the scan again.',
  '扫描期间文件越过授权目录，已停止。':
    'A file moved outside the authorized directory during the scan. The scan was stopped.',
  '扫描期间文件路径发生变化，请重试。': 'A file path changed during the scan. Run the scan again.',
  '扫描期间文件内容发生变化，请重试。': 'File content changed during the scan. Run the scan again.',
  '模板源码超过 2 MiB，无法创建。': 'Template source exceeds 2 MiB and cannot be created.',
  '模板文件必须创建在当前工作区根目录。':
    'The template file must be created in the current workspace root.',
  '同名文件已经存在，未覆盖原文件。':
    'A file with the same name already exists. The existing file was not overwritten.',
  '无法创建模板文件，请检查文件夹权限。':
    'Unable to create the template file. Check folder permissions.',
  '模板文件已创建，但索引更新失败。请重新扫描工作区。':
    'The template file was created, but the index update failed. Rescan the workspace.',
  '模板文件必须创建在当前工作区内。':
    'The template file must be created inside the current workspace.',
  '模板文件已创建，但索引更新失败。': 'The template file was created, but the index update failed.',
  '模板元数据服务未初始化。': 'The template metadata service is not initialized.',
  '无法创建模板文件，请检查目录权限。':
    'Unable to create the template file. Check directory permissions.',
  '模板记录不存在，可能需要重新扫描。':
    'The template record does not exist. The workspace may need to be rescanned.',
  '模板文件超过 2 MiB，无法在应用内打开。':
    'The template file exceeds 2 MiB and cannot be opened in the app.',
  '该文件不是可显示的文本源码。': 'This file is not displayable text source.',
  '无法读取工作区索引，请重试。': 'Unable to read the workspace index. Try again.',
  '主进程返回了无效响应。': 'The main process returned an invalid response.',
  '请求参数无效，请重试。': 'The request parameters are invalid. Try again.',
  'AI 服务拒绝了请求（HTTP 400）。请检查模型是否支持当前协议和请求参数。':
    'The AI service rejected the request (HTTP 400). Check whether the model supports the selected protocol and parameters.',
})

Object.assign(english, {
  'AI 草稿原始题面': 'AI draft original statement',
  'AI 草稿题目摘要': 'AI draft problem summary',
  'AI 题目摘要': 'AI problem summary',
  'AI 返回的目标目录与分类链不一致，请重试。':
    'The target directory returned by the AI does not match the category chain. Try again.',
  'AI 引用了不存在的工作区父目录，请重试。':
    'The AI referenced a workspace parent directory that does not exist. Try again.',
  'AI 声明使用现有目录，但该目录尚不存在。':
    'The AI selected an existing directory that does not exist.',
  'Prompt 缓存': 'Prompt caching',
  已启用稳定前缀: 'Stable prefix enabled',
  '当前 Provider 未启用 Prompt 缓存，将使用普通请求。':
    'Prompt caching is disabled for this provider. A standard request will be used.',
  '上下文超过安全上限，发送内容已截断；原始本地文件未被修改。':
    'The context exceeded the safety limit and was truncated. Original local files were not modified.',
  '已按安全预算缩减可选上下文；完整目录、模板 ID、名称、相对路径和语言仍全部保留。':
    'Optional context was reduced to fit the safety budget. The complete directory tree, template IDs, names, relative paths, and languages are still preserved.',
  '已按安全预算缩减部分可选上下文；请检查上方覆盖统计。':
    'Some optional context was reduced to fit the safety budget. Check the coverage statistics above.',
  完整工作区目录覆盖: 'Complete workspace catalog coverage',
  模板名称: 'Template names',
  目录节点: 'Directory nodes',
  模板摘要: 'Template summaries',
  相关源码片段: 'Related source snippets',
  '目录上下文 Token': 'Catalog context tokens',
  字符: 'characters',
  摘要缩短: 'Summaries shortened',
  附加字段省略: 'Supplemental fields omitted',
  源码片段省略: 'Source snippets omitted',
  是: 'Yes',
  否: 'No',
  '存在不可接受的模板名称裁剪，禁止发送。':
    'Unacceptable template-name truncation detected. Sending is blocked.',
  '模板名称完整，无不可接受裁剪。': 'All template names are included without truncation.',
  文件计划发送快照: 'File-plan request snapshot',
  详细候选: 'Detailed candidates',
  源码片段: 'Source snippets',
  元数据字符: 'Metadata characters',
  总输入字符: 'Total input characters',
  候选元数据省略: 'Candidate metadata omitted',
  候选源码省略: 'Candidate source omitted',
  '旧版计划没有旧值快照；以下仅展示计划保存的新值。':
    'This legacy plan has no previous-value snapshot; only the saved new values are shown.',
  旧计划未记录旧值: 'Previous value not recorded in this legacy plan',
  解决问题: 'Solves',
  适用约束: 'Constraints',
  前置条件: 'Prerequisites',
  常见错误: 'Common mistakes',
  高风险: 'High risk',
  '已展示 {shown} / {total}': 'Showing {shown} / {total}',
  '路径已展示 {shown} / {total}': 'Showing {shown} / {total} paths',
  展开全部: 'Show all',
  收起: 'Collapse',
  '请先处理当前待确认计划，再生成新的 AI 文件计划。':
    'Resolve the current pending plan before generating another AI file plan.',
  '无法证明总体文件管理请求包含完整模板目录，已在网络发送前停止。':
    'The complete template catalog could not be verified. The request was stopped before network access.',
  '发送预览已过期，请重新预览后再确认。':
    'The request preview expired. Preview again before confirming.',
  '发送预览不属于当前工作区，请重新预览。':
    'The request preview does not belong to the current workspace. Preview again.',
  'Provider、模型或连接配置已变化，请重新预览。':
    'The provider, model, or connection settings changed. Preview again.',
  '工作区目录或元数据已变化，请重新预览。':
    'The workspace catalog or metadata changed. Preview again.',
  '工作区模板集合已变化，请重新预览。':
    'The workspace template set changed. Preview again.',
  '工作区目录已变化，请重新预览。': 'The workspace catalog changed. Preview again.',
  '发送预览不存在、已过期或已消费，请重新预览。':
    'The request preview is missing, expired, or already consumed. Preview again.',
  '当前工作区已有 AI 文件计划正在生成。':
    'An AI file plan is already being generated for this workspace.',
  完整工作区模板目录: 'Complete workspace template catalog',
  分级摘要与相关源码补充: 'Tiered summaries and related source details',
  不适用条件: 'Not applicable when',
  使用前警告: 'Warnings before use',
  使用现有目录: 'Use existing directory',
  '关闭 AI 发送预览': 'Close AI request preview',
  原始题面: 'Original statement',
  '可选：题目的简洁结构化摘要…': 'Optional: a concise structured problem summary…',
  输出: 'Output',
  输出说明: 'Output description',
  输出语言: 'Output language',
  返回修改: 'Back to edit',
  将新建分类目录: 'Create category directories',
  '尚未生成 AI 题目摘要。': 'No AI problem summary has been generated.',
  '尚未记录原始题面。': 'No original statement recorded.',
  数据约束: 'Constraints',
  样例: 'Examples',
  '检查 Provider、工作区上下文和用户内容；确认前不会发起网络请求。':
    'Review the provider, workspace context, and user content. No network request is sent before confirmation.',
  简体中文: 'Simplified Chinese',
  算法信号: 'Algorithm signals',
  确认发送并生成: 'Confirm and generate',
  '确认发送给 AI': 'Confirm request to AI',
  '记录原始题面、输入输出和数据范围…':
    'Record the original statement, input/output, and constraints…',
  请求概要: 'Request summary',
  结构化输出预算: 'Structured output budget',
  '最高 32,768 tokens；模型明确拒绝时自动降低预算重试':
    'Up to 32,768 tokens; automatically retries with a lower budget when the model explicitly rejects it.',
  '每份最高 32,768 tokens；模型明确拒绝时自动降低预算重试':
    'Up to 32,768 tokens per file; automatically retries with a lower budget when the model explicitly rejects it.',
  'AI 正在生成 · 已等待 {seconds} 秒': 'AI is generating · {seconds}s elapsed',
  '{calls} 次 Provider 请求 · 总耗时 {seconds} 秒 · 输出预算 {budgets}':
    '{calls} provider calls · {seconds}s total · output budgets {budgets}',
  '{stage} {seconds} 秒（{count} 次请求）': '{stage} {seconds}s ({count} calls)',
  首次生成: 'Initial generation',
  'Schema 降级': 'Schema fallback',
  结构修复: 'Structure repair',
  语义重试: 'Semantic retry',
  输入: 'Input',
  输入说明: 'Input description',
  适用条件: 'Applicable when',
  边界情况: 'Edge cases',
  题目分析输出语言: 'Problem analysis output language',
  题面证据: 'Statement evidence',
  解释: 'Explanation',
  未提取: 'Not extracted',
})

Object.assign(english, {
  备份生命周期: 'Backup lifecycle',
  '保留策略只生成建议，不会后台删除。确认后的项目只移入应用隔离区，并可撤销。':
    'Retention only produces recommendations and never deletes in the background. Confirmed items move to the app quarantine and can be undone.',
  备份保留策略: 'Backup retention policy',
  永久保留: 'Keep forever',
  '保留 7 天': 'Keep for 7 days',
  '保留 30 天': 'Keep for 30 days',
  '保留 90 天': 'Keep for 90 days',
  受管数据占用: 'Managed storage',
  可隔离占用: 'Eligible for quarantine',
  异常中断残留: 'Interrupted-operation residue',
  可撤销隔离操作: 'Undoable quarantine operations',
  '占用数值以字节计：受管 {managed}，可隔离 {eligible}。':
    'Storage values: {managed} managed, {eligible} eligible for quarantine.',
  恢复预备份: 'Restore preflight backups',
  文件计划备份: 'File-plan backups',
  批量导入备份: 'Batch-import backups',
  题目图片残留区: 'Problem-image residue',
  数据隔离区: 'Data quarantine',
  '{count} 项 · {bytes}': '{count} items · {bytes}',
  发现异常中断残留: 'Interrupted-operation residue found',
  '这些目录可能包含恢复前原始数据，当前只报告并保护，不会从清理入口移动。':
    'These directories may contain original pre-restore data. They are reported and protected, and cannot be moved by cleanup.',
  逐项治理清单: 'Itemized lifecycle list',
  '受保护项目不可选择；需要判断的项目必须由你主动勾选。':
    'Protected items cannot be selected. Review items require your explicit selection.',
  选择全部可隔离项: 'Select all eligible items',
  题目图片残留: 'Problem-image residue',
  '仍用于撤销文件计划，必须保留': 'Required to undo an applied file plan',
  '批量导入备份，需要你判断': 'Batch-import backup requiring your review',
  '预备份校验未通过，需要你判断': 'Preflight backup failed verification and needs review',
  '最新有效预备份，必须保留': 'Newest valid preflight backup; protected',
  无当前记录的题目图片残留: 'Problem-image residue without a current record',
  已超过所选保留期: 'Older than the selected retention window',
  当前策略为永久保留: 'Current policy keeps backups forever',
  '文件计划已经回滚，可建议隔离': 'The file plan was rolled back; quarantine is recommended',
  '包含符号链接，禁止处理': 'Contains a symbolic link and cannot be processed',
  '没有对应执行记录，需要你判断': 'No matching execution record; review required',
  仍在所选保留期内: 'Still within the selected retention window',
  '选择治理项目 {id}': 'Select lifecycle item {id}',
  受保护: 'Protected',
  建议隔离: 'Quarantine suggested',
  需要判断: 'Review required',
  '清单超过 100 项；本次仅显示前 100 项，请分批处理。':
    'The list exceeds 100 items. Only the first 100 are shown; process them in batches.',
  '当前没有受管备份或异常残留。': 'No managed backups or operation residue found.',
  '正在生成预览…': 'Preparing preview...',
  预览隔离操作: 'Preview quarantine',
  隔离预览可继续: 'Quarantine preview can continue',
  隔离预览已阻止: 'Quarantine preview is blocked',
  '将移动 {count} 项、共 {bytes}；不会永久删除，可从隔离区撤销。':
    'Move {count} items totaling {bytes}. Nothing is permanently deleted, and the operation can be undone.',
  '候选已变化或包含受保护项目，请重新诊断。':
    'Candidates changed or include protected items. Diagnose again.',
  '我已核对清单，并允许应用把所选项目移入隔离区。':
    'I reviewed the list and allow the app to move the selected items into quarantine.',
  确认移入隔离区: 'Confirm quarantine',
  '所选项目已移入隔离区，可以撤销；没有永久删除文件。':
    'Selected items moved into quarantine and can be undone. No files were permanently deleted.',
  '已从隔离区恢复 {count} 项；未覆盖任何后续文件。':
    'Restored {count} items from quarantine without overwriting later files.',
  撤销隔离: 'Undo quarantine',
  '正在读取备份生命周期…': 'Reading backup lifecycle...',
  '清理候选已变化或包含受保护项目，请重新预览。':
    'Cleanup candidates changed or include protected items. Preview again.',
  '清理候选已变化，请重新诊断和预览。': 'Cleanup candidates changed. Diagnose and preview again.',
  '清理候选在确认后发生变化，操作已取消。':
    'A cleanup candidate changed after confirmation. The operation was cancelled.',
  '模拟清理失败，已回滚到操作前状态。':
    'Simulated cleanup failure. All items were rolled back to their original locations.',
  '清理失败且自动回滚未完成，请在数据管理页检查异常残留。':
    'Cleanup failed and automatic rollback did not finish. Inspect operation residue in Data Management.',
  '隔离已完成，但清单刷新失败，请重新诊断。':
    'Quarantine completed, but the list could not refresh. Diagnose again.',
  '清理失败，已回滚到操作前状态。':
    'Cleanup failed. All items were rolled back to their original locations.',
  '隔离记录不存在、已变化或当前无法撤销。':
    'The quarantine record is missing, changed, or cannot currently be undone.',
  '原位置已有新文件，撤销已取消以避免覆盖。':
    'A new item occupies the original location. Undo was cancelled to avoid overwriting it.',
  '隔离内容已变化，撤销已取消。': 'Quarantined content changed. Undo was cancelled.',
  '模拟撤销失败，已回滚到隔离状态。': 'Simulated undo failure. Items were returned to quarantine.',
  '撤销失败且自动回滚未完成，请在数据管理页检查异常残留。':
    'Undo failed and automatic rollback did not finish. Inspect operation residue in Data Management.',
  '撤销失败，项目仍保留在隔离区。': 'Undo failed. Items remain in quarantine.',
  '隔离记录不在允许的数据目录内。':
    'The quarantine record is outside the allowed data directories.',
  '隔离记录路径无效。': 'The quarantine record path is invalid.',
  '隔离目标路径无效。': 'The quarantine destination path is invalid.',
  '隔离目标已存在，请重新诊断。': 'The quarantine destination exists. Diagnose again.',
  中断的隔离操作: 'Interrupted quarantine operation',
  恢复提交标记: 'Restore commit marker',
  中断的恢复操作: 'Interrupted restore operation',
  未知临时残留: 'Unknown temporary residue',
  可安全恢复: 'Safely recoverable',
  清理已完成恢复标记: 'Clear completed restore marker',
  完成已提交恢复的收尾: 'Finish committed restore cleanup',
  '仅保护，不执行': 'Protect only; take no action',
  恢复到操作前状态: 'Return to the pre-operation state',
  退回中断隔离项目: 'Return interrupted quarantine items',
  '隔离日志有效，可安全退回': 'The quarantine journal is valid and can be safely rolled back',
  '数据库已提交，可安全完成收尾': 'The database is committed and restore cleanup can safely finish',
  '日志缺失或损坏，保持只读保护': 'The journal is missing or invalid; keep read-only protection',
  '恢复预备份无效，保持只读保护':
    'The restore preflight backup is invalid; keep read-only protection',
  '恢复已完成，仅剩提交标记': 'Restore is complete; only its commit marker remains',
  '提交前中断，可安全恢复旧状态':
    'Interrupted before commit; the previous state can be safely restored',
  '文件状态已变化，保持只读保护': 'File state changed; keep read-only protection',
  '来源无法证明，保持只读保护': 'The source cannot be proven; keep read-only protection',
  '只有日志、提交标记和文件指纹都一致的操作才能手动恢复；其余残留继续只读保护。':
    'Manual recovery is available only when the journal, commit marker, and file fingerprints all agree. Other residue stays read-only and protected.',
  预览异常恢复: 'Preview interrupted recovery',
  异常恢复预览可继续: 'Interrupted recovery preview can continue',
  异常恢复预览已阻止: 'Interrupted recovery preview is blocked',
  '将执行：{action}。': 'Action: {action}.',
  '操作状态或恢复预备份已变化，请重新诊断。':
    'The operation state or restore preflight backup changed. Diagnose again.',
  '我已核对异常恢复预览，并允许应用执行所示安全恢复操作。':
    'I reviewed the interrupted recovery preview and allow the app to perform the shown safe recovery action.',
  确认异常恢复: 'Confirm interrupted recovery',
  '异常操作已按预览安全处理。': 'The interrupted operation was safely handled as previewed.',
  移入系统废纸篓: 'Move to system Trash',
  废纸篓移交预览可继续: 'Trash handoff preview can continue',
  废纸篓移交预览已阻止: 'Trash handoff preview is blocked',
  '将把 {count} 项、共 {bytes} 移交系统废纸篓；应用不会直接永久删除。':
    'Move {count} items totaling {bytes} to system Trash. The app will not permanently delete them directly.',
  '隔离记录或内容已变化，请重新诊断。':
    'The quarantine record or its contents changed. Diagnose again.',
  '我已核对隔离记录，并允许应用将其移交系统废纸篓。':
    'I reviewed the quarantine record and allow the app to hand it off to system Trash.',
  确认移入系统废纸篓: 'Confirm move to system Trash',
  '隔离记录已移交系统废纸篓；永久清空仍由操作系统和你决定。':
    "The quarantine record was handed off to system Trash. Permanent emptying remains under your and the operating system's control.",
  '系统废纸篓当前不可用。': 'System Trash is currently unavailable.',
  '异常操作已变化或当前不可恢复，请重新诊断。':
    'The interrupted operation changed or is not currently recoverable. Diagnose again.',
  '隔离记录已变化或当前不能移入系统废纸篓。':
    'The quarantine record changed or cannot currently be moved to system Trash.',
  '隔离记录已变化，请重新预览。': 'The quarantine record changed. Preview it again.',
  '系统废纸篓未接收隔离记录，原数据仍保留。':
    'System Trash did not accept the quarantine record. The original data remains.',
  '恢复目录包含符号链接，操作已取消。':
    'A restore directory contains a symbolic link. The operation was cancelled.',
  '模拟恢复异常中断，已保留恢复日志。':
    'Simulated restore interruption. The recovery journal was preserved.',
  '模拟恢复已提交但收尾中断，已保留恢复日志。':
    'Simulated interruption after restore commit. The recovery journal was preserved.',
  '恢复已提交，但收尾未完成，请在数据管理页处理异常操作。':
    'Restore was committed, but cleanup did not finish. Handle the interrupted operation in Data Management.',
  '恢复异常中断，已保留可验证恢复日志。':
    'Restore was interrupted. A verifiable recovery journal was preserved.',
  '恢复失败且自动回滚未完成，请在数据管理页处理异常操作。':
    'Restore failed and automatic rollback did not finish. Handle the interrupted operation in Data Management.',
  '备份快照包含恢复事务临时标记。':
    'The backup snapshot contains a temporary restore transaction marker.',
  '模拟清理异常中断，已保留恢复日志。':
    'Simulated cleanup interruption. The recovery journal was preserved.',
  '异常操作当前没有可执行的恢复策略。':
    'The interrupted operation does not currently have an executable recovery strategy.',
  '恢复日志目录不在受控 userData 内。':
    'The restore journal directory is outside the controlled userData location.',
  '清理恢复日志不可用。': 'The cleanup recovery journal is unavailable.',
  '清理中断状态已变化，恢复已取消。':
    'The interrupted cleanup state changed. Recovery was cancelled.',
  '模拟异常恢复失败，已保持中断前状态。':
    'Simulated interrupted recovery failure. The prior interrupted state was preserved.',
  '异常恢复失败且回滚未完成，请停止操作并保留现场。':
    'Interrupted recovery failed and rollback did not finish. Stop operations and preserve the current state.',
  '异常恢复失败，已保持中断前状态。':
    'Interrupted recovery failed. The prior interrupted state was preserved.',
  '恢复日志不可用。': 'The restore recovery journal is unavailable.',
  '恢复中断状态已变化，操作已取消。':
    'The interrupted restore state changed. The operation was cancelled.',
  '已提交恢复记录不完整。': 'The committed restore record is incomplete.',
  '恢复提交标记当前不能清理。': 'The restore commit marker cannot currently be cleared.',
})

Object.assign(english, {
  'AI 响应超过 1 MiB 安全上限，已停止读取。请缩短输入或降低模型输出长度。':
    'The AI response exceeded the 1 MiB safety limit. Shorten the input or reduce the output length.',
  'AI 流式响应中断。供应商可能已产生用量，请检查模型状态后再重试。':
    'The AI stream was interrupted. The provider may have recorded usage; check the model status before retrying.',
  'AI 服务返回了无法识别的协议响应，请核对 Provider 协议与模型。':
    'The AI service returned an unrecognized protocol response. Check the provider protocol and model.',
  'AI 鉴权失败。请在 AI 设置中检查 API Key 和自定义请求头。':
    'AI authentication failed. Check the API key and custom headers in AI Settings.',
  'AI 模型或接口不存在。请核对 Base URL、协议和模型 ID。':
    'The AI model or endpoint does not exist. Check the base URL, protocol, and model ID.',
  'AI 服务限流。应用只会有限重试；仍失败时请稍后重试或更换模型。':
    'The AI service is rate limited. Retries are bounded; try later or switch models if it still fails.',
  'AI 模型不存在或不可用。请核对模型 ID 与账号权限。':
    'The AI model does not exist or is unavailable. Check the model ID and account access.',
  'AI 请求已取消，迟到响应不会写入状态。':
    'The AI request was cancelled. Late responses will not update state.',
  '连接 AI 服务超时。请检查网络、Base URL 或稍后重试。':
    'The AI connection timed out. Check the network and base URL, or retry later.',
  '等待 AI 响应超时。供应商可能已产生用量，请检查模型状态后手动重试。':
    'The AI response timed out. The provider may have recorded usage; check the model status before retrying manually.',
  '读取 AI 响应时网络中断。请检查网络后手动重试。':
    'The network was interrupted while reading the AI response. Check the network and retry manually.',
  '无法连接 AI 服务。请检查网络和 Base URL。':
    'Unable to connect to the AI service. Check the network and base URL.',
  '同一 AI 请求已在运行，请勿重复提交。':
    'The same AI request is already running. Do not submit it again.',
  '当前任务模型不支持图片输入。请改用声明视觉能力的 Provider。':
    'The current model does not support image input. Choose a provider that declares vision capability.',
  取消当前及后续补全: 'Cancel current and remaining completion',
  支持: 'Supported',
  不支持: 'Unsupported',
  原生支持: 'Native',
  本地严格校验: 'Strict local validation',
})

Object.assign(english, {
  '模板源码已保存；事务备份稍后可在数据管理中清理':
    'Template source saved. The transactional backup can be cleaned up later in Data Management.',
  '模板源码已安全保存，并保留原有元数据与题目关联':
    'Template source saved safely. Existing metadata and problem relations were preserved.',
  'Provider 详情滚动区': 'Provider details scroll area',
  'Provider 列表滚动区': 'Provider list scroll area',
  '已加载 {processed} / {total} 份计划；确认后永久删除历史与专属撤销备份。':
    'Loaded {processed} / {total} plans. Confirmation permanently deletes history and its dedicated rollback backups.',
  '将永久删除 {count} 份计划：{cancelled} 份已取消、{applied} 份已执行、{rolledBack} 份已撤销；其中 {archived} 份为旧归档记录。':
    'Permanently delete {count} plans: {cancelled} cancelled, {applied} applied, and {rolledBack} rolled back. {archived} are legacy archived records.',
  '同时永久删除 {executions} 条子执行和 {backups} 份现存撤销备份；另有 {missing} 份备份已缺失。当前模板文件不会恢复、移动或修改。删除后计划、执行记录和撤销能力均无法恢复。':
    'Also permanently delete {executions} child executions and {backups} existing rollback backups; {missing} backups are already missing. Current template files will not be restored, moved, or changed. The plans, execution records, and rollback capability cannot be recovered afterward.',
  确认永久删除计划记录: 'Confirm permanent plan record deletion',
  '暂无可删除计划记录。': 'No plan records can be deleted.',
  旧归档记录: 'Legacy archived records',
  永久清理旧归档: 'Permanently clean legacy archives',
  '没有旧版软归档记录。': 'No legacy soft-archived records.',
  旧归档: 'Legacy archive',
  永久删除旧归档记录: 'Permanently delete legacy archived record',
  加载更多旧归档记录: 'Load more legacy archived records',
  '将永久删除 {count} 条执行记录：{applied} 条已执行、{rolledBack} 条已撤销。':
    'Permanently delete {count} execution records: {applied} applied and {rolledBack} rolled back.',
  '将永久删除 {backups} 份现存撤销备份，另有 {missing} 份已缺失；当前模板、题目、关系和源码不会被撤销或修改。已执行记录删除后无法再从备份撤销，本次历史删除无法恢复。':
    'Permanently delete {backups} existing rollback backups; {missing} are already missing. Current templates, problems, relations, and source files will not be rolled back or changed. Applied records can no longer be rolled back from backup, and this history deletion cannot be recovered.',
  确认永久删除执行记录: 'Confirm permanent execution record deletion',
  永久删除执行记录: 'Permanently delete execution record',
  '已永久删除 {count} 份计划、{executions} 条子执行和 {backups} 份撤销备份；当前模板文件未修改。':
    'Permanently deleted {count} plans, {executions} child executions, and {backups} rollback backups. Current template files were not changed.',
  '已永久删除 {count} 条执行记录和 {backups} 份撤销备份；当前模板文件未修改。':
    'Permanently deleted {count} execution records and {backups} rollback backups. Current template files were not changed.',
  清理已完成历史删除标记: 'Clear completed history-deletion marker',
  完成已提交历史删除的备份清理: 'Finish backup cleanup for committed history deletion',
  '历史删除已提交，可安全完成备份清理':
    'History deletion is committed and its backup cleanup can be completed safely.',
  '源码没有变化，无需保存。': 'The source has not changed, so there is nothing to save.',
  '无法生成源码 Diff，请重试。': 'Unable to generate the source diff. Try again.',
  '源码保存失败，原文件已保持或恢复。':
    'Source save failed. The original file was preserved or restored.',
  '编辑模式 · Cmd/Ctrl+S 查看 Diff · Escape 取消':
    'Edit mode · Cmd/Ctrl+S to review the diff · Escape to cancel',
  未保存: 'Unsaved',
  '查看 Diff': 'Review diff',
  编辑代码: 'Edit code',
  '放弃未保存的源码修改？': 'Discard unsaved source changes?',
  '取消编辑不会写入文件，当前修改将从编辑器中移除。':
    'Cancelling does not write the file. Current changes will be removed from the editor.',
  确认放弃: 'Discard changes',
  继续编辑: 'Keep editing',
  '源码修改 Diff': 'Source change diff',
  确认源码修改: 'Confirm source changes',
  '原文件 SHA-256 已锁定；确认前文件变化会拒绝覆盖。':
    'The original file SHA-256 is locked. If the file changes before confirmation, overwrite will be refused.',
  修改前: 'Before',
  '（无内容）': '(No content)',
  修改后: 'After',
  '关闭 Diff 或取消不会写入；确认保存后将原子替换源码并重新同步索引。':
    'Closing the diff or cancelling does not write the file. Confirming save atomically replaces the source and resynchronizes the index.',
  确认保存源码: 'Confirm source save',
  返回编辑: 'Return to editing',
  模板代码编辑器: 'Template code editor',
  编辑中: 'Editing',
  可编辑模板源码: 'Editable template source',
  '执行记录包含重复的撤销备份目录。':
    'Execution records contain duplicate rollback backup directories.',
  '执行记录中的撤销备份路径格式无效。':
    'A rollback backup path in the execution records has an invalid format.',
  '撤销备份不是受管普通目录，已取消整批删除。':
    'A rollback backup is not a managed regular directory. Batch deletion was cancelled.',
  '撤销备份包含符号链接，已取消整批删除。':
    'A rollback backup contains a symbolic link. Batch deletion was cancelled.',
  '撤销备份已变化，整批删除已取消。': 'A rollback backup changed. Batch deletion was cancelled.',
  '撤销备份在确认后发生变化，整批删除已取消。':
    'A rollback backup changed after confirmation. Batch deletion was cancelled.',
  '模拟历史删除暂存失败。': 'Simulated history-deletion staging failure.',
  '模拟历史删除提交后异常中断。': 'Simulated interruption after history deletion was committed.',
  '历史删除失败且撤销备份恢复未完成，请在数据管理页检查异常残留。':
    'History deletion failed and rollback backup recovery did not finish. Inspect interrupted items in Data Management.',
  '历史已删除，备份清理将在数据管理的异常恢复中完成。':
    'History was deleted. Backup cleanup will be completed from interrupted recovery in Data Management.',
  '历史删除失败，数据库记录与撤销备份均保持原状。':
    'History deletion failed. Database records and rollback backups remain unchanged.',
  '已提交历史删除记录不完整。': 'The committed history-deletion record is incomplete.',
  '历史删除中断状态已变化，清理已取消。':
    'The interrupted history-deletion state changed. Cleanup was cancelled.',
  '历史删除提交标记当前不能清理。':
    'The history-deletion commit marker cannot currently be cleared.',
  '执行记录不存在、不属于当前工作区或状态已变化，未删除任何记录。':
    'An execution record does not exist, belongs to another workspace, or changed state. Nothing was deleted.',
  '执行记录或撤销备份信息在确认后发生变化，未删除任何记录。':
    'Execution record or rollback backup details changed after confirmation. Nothing was deleted.',
  '计划不存在、不属于当前工作区、仍为草稿或状态已变化，未删除任何记录。':
    'A plan does not exist, belongs to another workspace, is still a draft, or changed state. Nothing was deleted.',
  '计划、子执行或撤销备份信息在确认后发生变化，未删除任何记录。':
    'Plan, child execution, or rollback backup details changed after confirmation. Nothing was deleted.',
  '历史删除服务尚未就绪，请重启应用后重试。':
    'The history-deletion service is not ready. Restart the app and try again.',
  '删除预览不存在、已过期或工作区已变化，请重新预览。':
    'The deletion preview does not exist, expired, or belongs to a changed workspace. Preview again.',
  '该文件不是有效的 UTF-8 文本源码。': 'This file is not valid UTF-8 text source.',
  '模板源码超过 2 MiB，无法保存。': 'Template source exceeds 2 MiB and cannot be saved.',
  '模板文件超过 2 MiB，无法在应用内编辑。':
    'The template file exceeds 2 MiB and cannot be edited in the app.',
  '源码编辑预览已过期或不属于当前工作区，请重新预览。':
    'The source edit preview expired or does not belong to the current workspace. Preview again.',
  '模板索引已变化，请重新读取并预览。':
    'The template index changed. Read the source and preview again.',
  '源码编辑备份目录未初始化。': 'The source edit backup directory is not initialized.',
  '源码已在预览后被外部修改，拒绝覆盖；请重新读取。':
    'The source was modified externally after the preview. Overwrite was refused; read it again.',
  '源码已在确认保存时发生变化，拒绝覆盖；请重新读取。':
    'The source changed while save was being confirmed. Overwrite was refused; read it again.',
  '源码已写入，但模板索引同步失败。':
    'The source was written, but template index synchronization failed.',
  '源码保存失败且自动恢复未完成；安全备份已保留，请停止编辑并检查工作区。':
    'Source save failed and automatic recovery did not finish. A safety backup was retained; stop editing and inspect the workspace.',
})

const englishPatterns: Array<{
  pattern: RegExp
  replace: (matches: RegExpMatchArray) => string
}> = [
  {
    pattern: /^每次最多批量导入 (\d+) 个 C\+\+ 文件。$/u,
    replace: matches => `A batch can include at most ${matches[1] ?? ''} C++ files.`,
  },
  {
    pattern: /^文件夹中超过 (\d+) 个 \.cpp 文件，请缩小导入范围。$/u,
    replace: matches =>
      `The folder contains more than ${matches[1] ?? ''} .cpp files. Choose a smaller import scope.`,
  },
  {
    pattern: /^无法读取批量源码：(.+)$/u,
    replace: matches => `Unable to read the batch source: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^批量导入包含重复目标路径：(.+)$/u,
    replace: matches => `The batch contains a duplicate target path: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^目标路径与已有文件仅大小写不同：(.+)$/u,
    replace: matches =>
      `The target differs from an existing file only by letter case: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^待覆盖文件状态已变化，请重新检查：(.+)$/u,
    replace: matches =>
      `The file selected for overwrite changed. Check it again: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^待覆盖文件内容已变化，请重新确认：(.+)$/u,
    replace: matches =>
      `The file selected for overwrite changed. Confirm it again: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^目标路径不能覆盖：(.+)$/u,
    replace: matches => `The target path cannot be overwritten: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^AI 服务暂不可用（HTTP (\d+)）。应用已限制自动重试次数。$/u,
    replace: matches =>
      `The AI service is temporarily unavailable (HTTP ${matches[1] ?? ''}). Automatic retries are bounded.`,
  },
  {
    pattern: /^AI 服务拒绝了请求（HTTP (\d+)）。请检查模型是否支持当前协议和请求参数。$/u,
    replace: matches =>
      `The AI service rejected the request (HTTP ${matches[1] ?? ''}). Check whether the model supports the protocol and parameters.`,
  },
  {
    pattern: /^AI 服务拒绝了请求（HTTP (\d+)）。请核对 Provider 协议和模型配置。$/u,
    replace: matches =>
      `The AI service rejected the request (HTTP ${matches[1] ?? ''}). Check the provider protocol and model configuration.`,
  },
  {
    pattern: /^AI 服务拒绝了请求（HTTP 400）：(.+)$/u,
    replace: matches => `The AI service rejected the request (HTTP 400): ${matches[1] ?? ''}`,
  },
  {
    pattern: /^AI 服务暂不可用（HTTP (\d+)）。$/u,
    replace: matches => `The AI service is temporarily unavailable (HTTP ${matches[1] ?? ''}).`,
  },
  {
    pattern: /^不允许自定义请求头“(.+)”。$/u,
    replace: matches => `Custom header “${matches[1] ?? ''}” is not allowed.`,
  },
  {
    pattern: /^每道题最多保存 (\d+) 张图片。$/u,
    replace: matches => `Each problem can store at most ${matches[1] ?? ''} images.`,
  },
  {
    pattern: /^目标路径已存在：(.+)$/u,
    replace: matches => `The target path already exists: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^原路径已被占用：(.+)$/u,
    replace: matches => `The original path is occupied: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^文件已在计划后被修改，拒绝撤销：(.+)$/u,
    replace: matches => `The file changed after the plan, so undo was refused: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^文件或元数据已在计划生成后变更，请重新生成计划：(.+)$/u,
    replace: matches =>
      `The file or metadata changed after the plan was generated. Generate a new plan: ${matches[1] ?? ''}`,
  },
  {
    pattern: /^目录层级超过 (\d+) 层，已停止继续扫描。$/u,
    replace: matches => `Scanning stopped because the directory depth exceeds ${matches[1] ?? ''}.`,
  },
  {
    pattern: /^模板数量超过 (\d+)，本次扫描已停止。$/u,
    replace: matches => `Scanning stopped because the template count exceeds ${matches[1] ?? ''}.`,
  },
]

function translateEnglish(source: string): string {
  const direct = english[source]
  if (direct) return direct
  for (const rule of englishPatterns) {
    const matches = source.match(rule.pattern)
    if (matches) return rule.replace(matches)
  }
  return source
}

interface I18nContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (source: string, variables?: Record<string, number | string>) => string
  toggleLocale: () => void
}

const defaultValue: I18nContextValue = {
  locale: 'zh-CN',
  setLocale: () => undefined,
  t: source => source,
  toggleLocale: () => undefined,
}

const I18nContext = createContext<I18nContextValue>(defaultValue)

function initialLocale(): AppLocale {
  return window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'zh-CN'
}

function interpolate(message: string, variables?: Record<string, number | string>): string {
  if (!variables) return message
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : match,
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(initialLocale)

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale
    document.title = locale === 'en' ? 'Algorithm Learning Workbench V2' : '智能算法学习助手 V2'
  }, [locale])

  const value = useMemo<I18nContextValue>(() => {
    const t = (source: string, variables?: Record<string, number | string>) =>
      interpolate(locale === 'en' ? translateEnglish(source) : source, variables)
    return {
      locale,
      setLocale,
      t,
      toggleLocale: () => setLocale(current => (current === 'en' ? 'zh-CN' : 'en')),
    }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// The provider and its matching hook intentionally share this small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
