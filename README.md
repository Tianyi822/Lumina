# Lumina

基于 Electron + Vue 3 + TypeScript 构建的桌面端 AI 助手，集成智能对话、知识库管理、Docker 沙箱执行、文档处理和论文阅读等功能。

## 功能

### 智能对话

- 流式对话，支持打字机效果
- 兼容 DeepSeek-R1 等推理模型，可展开查看完整思考过程
- 支持配置多个 AI 服务商（OpenAI、阿里云、智谱等）并按需切换
- ReAct 智能体模式：AI 自动判断何时调用工具，通过思考-行动-观察循环处理多步任务

### MCP 工具生态

- 连接任意兼容 MCP 协议的服务器，扩展 AI 能力
- 支持 stdio、SSE、StreamableHTTP 三种传输协议
- 自动获取 MCP 服务器提供的工具列表和参数定义
- 支持并行调用多个工具

### 个人知识库

- 上传 PDF、Word、Markdown、TXT、CSV 等格式文档
- 自动提取文档内容并切片，支持多种文件格式解析
- 基于 LanceDB 向量数据库实现语义搜索
- 可在对话中引用知识库内容
- 支持 OpenAI、阿里云、Ollama 本地模型等多种嵌入服务
- 知识库可作为 MCP 服务器供外部工具调用

### Docker 沙箱

- 在隔离的 Docker 容器中安全运行代码
- 支持 Docker Compose 多服务环境、Dockerfile 构建、预定义模板快速启动
- 内置 Vue、React、Vanilla 前端开发模板，支持实时预览和热重载
- 自动映射容器端口到主机
- 细粒度权限控制

### 论文阅读

- 文档解析、OCR、翻译、标注
- 批注笔记同步至文件资源池

### 其他

- 文档导出（PDF、Word 等格式）
- PPT 生成
- 内置精简提示词（面向论文阅读、知识库、MCP 与沙箱工具调用）
- 语音识别
- 视频生成

## 技术栈

- **桌面框架**：Electron + electron-vite
- **前端框架**：Vue 3 + TypeScript + Pinia
- **样式**：CSS 变量（Design Token）+ Scoped CSS
- **AI 接口**：OpenAI API 兼容接口
- **向量数据库**：LanceDB
- **文档解析**：pdf-parse、mammoth、markdown-it
- **容器**：dockerode
- **MCP 协议**：@modelcontextprotocol/sdk

## 数据存储

用户数据目录 `~/.lumina/` 包含配置文件、会话记录、知识库数据、PPT 模板和日志。
