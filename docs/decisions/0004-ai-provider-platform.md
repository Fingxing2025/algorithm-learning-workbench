# ADR-0004：多供应商 AI Provider 平台

- 状态：已接受
- 日期：2026-07-14
- 范围：阶段 3

## 背景

V2 需要让用户从零配置不同 AI 服务，并按题目图片分析、模板元数据补全和工作区整理等任务选择合适模型。Provider 配置包含模型能力和网络端点，API Key 属于高敏感数据；Renderer、SQLite、日志和截图都不能接触明文密钥。

## 决策

1. 业务功能只依赖统一 `AiProviderAdapter`，不直接拼接供应商请求。
2. 首批协议边界固定为 OpenAI-compatible Chat Completions、OpenAI Responses、Anthropic Messages、Gemini GenerateContent 与 Ollama Chat；阶段 3 的连接测试至少覆盖 OpenAI Chat Completions 与 Anthropic 两个不同协议。
3. Provider profile 保存显示名称、协议、Base URL、模型、能力、超时和非敏感自定义请求头。SQLite 只保存 `secret_ref`，Renderer 只接收 `hasSecret`，从不接收密钥或密文。
4. Main 使用 Electron `safeStorage` 加密密钥，并将密文单独写入 `userData/secrets/<uuid>.secret`。保存新密钥时先写临时文件并原子改名，再更新数据库；数据库失败时删除新文件，成功后才删除旧文件。
5. 若 `safeStorage` 不可用，拒绝持久化密钥。Linux 若选中 `basic_text` 后端，同样拒绝持久化并提示用户配置系统密钥环。
6. 除 Ollama 外，Base URL 只允许无凭据、无查询参数的 `https:` URL。Ollama 额外允许 loopback 主机上的 `http:`；测试构建可以通过显式环境开关允许 loopback HTTP mock，生产构建不接受该开关。
7. 自定义请求头不能覆盖 `authorization`、`x-api-key`、`x-goog-api-key`、`host`、`content-length`、`cookie`、`proxy-authorization` 等鉴权或传输敏感头。
8. 网络请求只由 Main 发出，使用固定协议路径、JSON 请求体、超时中止和有限响应体读取。连接测试发送最小文本提示，不发送模板、题目、图片或用户笔记。
9. Adapter 将失败归一为鉴权、模型不存在、限流、网络、超时、不支持能力和响应格式错误，并返回可操作的中文提示，不回显响应头、请求体、密钥或完整供应商响应。
10. `ai_task_routes` 保存任务到 Provider 的路由。路由保存前验证 Provider 声明的能力满足任务要求；题图分析必须选择视觉 Provider。
11. `0002_ai_providers` 是增量 migration，不修改现有模板、题目、图片或关联数据。
12. DeepSeek 与阿里云百炼作为 Renderer 中的 OpenAI-compatible 配置预设，不增加供应商专属协议或数据库字段。DeepSeek 使用官方 `https://api.deepseek.com`，默认模型跟随当前文档使用 `deepseek-v4-flash`；阿里云百炼中国大陆端点包含用户自己的 `WorkspaceId`，因此只展示北京端点模板并要求用户填写，不能保存虚构或过时的固定地址。
13. 结构化任务在内部请求契约中标记为禁用思考。OpenAI Chat Adapter 对 Qwen 模型发送顶层 `enable_thinking: false`，避免思考 Token 耗尽后 `content` 为空；其他供应商不会收到该非标准字段。响应提取同时兼容 OpenAI `choices` 与阿里云嵌套 `output.choices`，仅当最终正文为空时才把 `reasoning_content` 交给既有 JSON 解析与受限修复流程，且不记录或展示思考内容。
14. 模板元数据任务使用 32,768 输出 Token 的首选预算，结构修复和语义重试继承同一预算。Provider 若以可识别的 Token/上下文上限错误明确拒绝，任务路由按 16,384、8,192、4,096、2,048 逐档降低；鉴权、模型不存在、普通参数错误和无法读取正文不会触发降档。实际计费仍按供应商生成量而非预算上限决定。

## 协议基线

- OpenAI Chat Completions：`POST /chat/completions`，请求包含 `model` 与 `messages`，读取 `choices[0].message.content`。
- OpenAI Responses：`POST /responses`，请求包含 `model` 与 `input`，优先读取 `output_text`，否则从 `output[].content[]` 提取 `output_text`。
- Anthropic Messages：`POST /messages`，使用 `x-api-key` 和 `anthropic-version`，读取 `content[]` 中的文本块。
- Gemini GenerateContent：`POST /models/{model}:generateContent`，使用 `x-goog-api-key`，读取 candidates parts 文本。
- Ollama Chat：`POST /api/chat`，请求包含 `model`、`messages` 与 `stream: false`。

OpenAI 请求与响应结构以官方 OpenAPI 规范为准：<https://github.com/openai/openai-openapi/blob/master/openapi.yaml>。密钥加密能力以 Electron `safeStorage` 文档为准：<https://www.electronjs.org/docs/latest/api/safe-storage>。

供应商预设以各自官方文档为准：

- DeepSeek：<https://api-docs.deepseek.com/>
- 阿里云百炼 OpenAI 兼容 Chat：<https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope>

## 后果

- 更换系统用户、系统密钥环损坏或复制应用数据目录后，原密钥可能无法解密；界面必须允许用户重新输入。
- 自定义 Provider 不是任意 HTTP 调试器；固定路径和敏感头限制会牺牲少量兼容性，换取更清晰的安全边界。
- Provider 配置可独立存在于空白应用中，不依赖模板工作区或旧项目数据。
- 阶段 4 的题目 AI 分析只能通过任务路由调用本平台，并且分析结果仍须先成为草稿。
