# Lumina

桌面端 AI 助手应用，基于 Electron + Vue 3 + TypeScript 构建，集成智能对话、知识库管理、代码沙箱执行等功能。

## 核心功能

### 智能对话系统

- **流式对话**：实时显示 AI 回复内容，支持打字机效果
- **推理模型支持**：兼容 DeepSeek-R1 等推理模型，可展开查看模型的完整思考过程
- **ReAct 智能体模式**：AI 自动判断何时调用工具，通过思考-行动-观察循环处理复杂多步任务（最多 10 轮迭代）
- **多模型配置**：支持配置多个 AI 服务商（OpenAI、阿里云、智谱等），按需切换

### MCP 工具生态

- **MCP 服务器连接**：支持连接任意兼容 MCP 协议的服务器，扩展 AI 能力
- **多种传输协议**：支持 stdio、SSE、StreamableHTTP 三种传输方式
- **动态工具发现**：自动获取 MCP 服务器提供的工具列表和参数定义
- **并行执行**：支持同时调用多个工具，提高任务执行效率
- **工具调用可视化**：实时显示工具调用状态、参数和返回结果

### 个人知识库

- **文档管理**：上传 PDF、Word、Markdown、TXT、CSV 等格式文档
- **智能解析**：自动提取文档内容并切片，支持多种文件格式解析
- **语义检索**：基于向量数据库（LanceDB）实现语义搜索，理解查询意图
- **对话引用**：在对话中引用知识库内容，获得基于个人资料的精准回答
- **嵌入模型**：支持 OpenAI、阿里云、Ollama 本地模型等多种嵌入服务
- **MCP 集成**：知识库可作为 MCP 服务器，供其他工具调用

### Docker 沙箱环境

- **代码执行**：在隔离的 Docker 容器中安全运行代码
- **多种创建方式**：
  - 基于 Docker Compose 创建多服务环境
  - 基于 Dockerfile 构建自定义镜像
  - 使用预定义模板快速启动（Vue、React、Vanilla）
- **前端开发沙箱**：内置前端项目模板，支持实时预览和热重载
- **文件操作**：在沙箱内读写文件、执行 Shell 命令
- **端口映射**：自动映射容器端口到主机，支持本地访问
- **日志监控**：实时查看容器日志和运行状态
- **权限管控**：细粒度的权限控制，确保主机安全

### 提示词工程

- **系统提示词自定义**：可编辑 AI 系统提示词，定制 AI 行为
- **模板变量**：支持在提示词中插入动态变量
- **示例管理**：添加 Few-shot 示例，提升特定任务表现
- **ReAct 流程配置**：自定义推理和行动指导流程
- **实时预览**：测试和验证提示词效果

## 项目架构

```
lumina/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── core/       # 应用核心（窗口管理、生命周期）
│   │   ├── services/   # 业务服务
│   │   │   ├── chat/         # 对话服务（ReAct、流处理）
│   │   │   ├── mcp/          # MCP 服务
│   │   │   ├── knowledge/    # 知识库服务
│   │   │   ├── sandbox/      # 沙箱服务
│   │   │   ├── document/     # 文档导出服务
│   │   │   ├── vector/       # 向量数据库
│   │   │   └── config/       # 配置管理
│   │   ├── ipc/        # IPC 处理器
│   │   └── types/      # TypeScript 类型定义
│   ├── preload/        # 预加载脚本（主进程与渲染进程桥梁）
│   └── renderer/       # Vue 3 前端应用
│       ├── src/
│       │   ├── pages/       # 页面组件
│       │   ├── components/  # 可复用组件
│       │   ├── stores/      # Pinia 状态管理
│       │   ├── composables/ # Vue 组合式函数
│       │   └── types/       # 类型定义
│       └── index.html
├── build/              # 构建资源
├── resources/          # 静态资源
└── docs/               # 文档
```

## 技术栈

- **桌面框架**：Electron + electron-vite
- **前端框架**：Vue 3 + TypeScript
- **状态管理**：Pinia + pinia-plugin-persistedstate
- **样式**：CSS 变量 + Scoped CSS
- **AI 接口**：OpenAI API 兼容接口
- **向量数据库**：LanceDB
- **文档解析**：pdf-parse, mammoth, markdown-it
- **Docker 集成**：dockerode
- **MCP 协议**：@modelcontextprotocol/sdk

## 使用指南

### 快速开始

1. 首次启动后，点击设置图标配置 AI 服务商 API Key
2. 在对话页面点击"新建对话"开始聊天
3. 点击工具栏图标连接 MCP 服务器扩展功能

### 知识库使用

1. 切换到知识库页面
2. 创建新的知识库并上传文档
3. 等待文档解析完成
4. 在对话中点击知识库图标引用相关内容

### 沙箱使用

1. 切换到沙箱页面
2. 点击"新建沙箱"选择创建方式
3. 配置端口映射和项目目录
4. 在沙箱内执行代码或运行项目

## 安全说明

- 所有敏感配置（API Key 等）存储在用户本地目录，不会上传
- Docker 沙箱运行在隔离容器内，与主机环境隔离
- 沙箱操作有权限控制，默认限制对主机文件系统的访问
- MCP 工具执行在受控环境中，可配置允许/拒绝列表

## 致谢

- [Electron](https://www.electronjs.org/)
- [Vue.js](https://vuejs.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
