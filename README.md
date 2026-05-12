# Lumina

面向科研的桌面端论文阅读工具，支持 AI 交互式阅读、知识库文献管理、Docker 实验环境以及远程 SSH 操作。

[![Version](https://img.shields.io/github/v/release/Tianyi822/Lumina?color=blue&label=version)](https://github.com/Tianyi822/Lumina/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](https://github.com/Tianyi822/Lumina/releases)
[![Electron](https://img.shields.io/badge/built%20with-Electron-47848F.svg)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D.svg)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg)](https://www.typescriptlang.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## 功能

### 论文阅读

支持 PDF 解析、OCR 文字识别、翻译和批注。通过多阶段 OCR 流水线将论文中的文字、公式、图表结构化提取为 Markdown，自动识别段落类型（标题、正文、公式、表格、图注等），并支持图表提取与资源本地化。

阅读过程中，可以为论文段落添加批注笔记，批注与原文位置自动关联，所有标注数据同步保存至文件资源池。

### AI 交互阅读

兼容 OpenAI API 的流式对话能力，支持配置多个服务商（OpenAI、阿里云、智谱等）并按需切换。在论文阅读中，可以直接引用原文段落向 AI 提问，AI 结合论文上下文给出回答，适合论文精读、文献综述和思路讨论等场景。

支持 DeepSeek-R1 等推理模型，可展开查看完整的思考过程。

### ReAct 智能体

AI 能够自主判断何时调用工具，通过思考-行动-观察循环完成多步任务。当会话关联了知识库或工具时，系统自动切换为 ReAct 模式——构建包含工具描述的系统提示词，LLM 返回推理过程与工具调用，调度器并行执行无依赖的工具，执行结果反馈给 LLM 继续推理，最多支持 10 轮迭代。

### 知识库

支持导入 PDF、Word、Markdown、TXT、CSV 等格式文档，自动提取内容并切片，通过 LanceDB 向量数据库实现语义检索。知识库以工具形式提供给 AI 模型，由模型自主决定是否检索以及检索什么内容，而非每次对话自动搜索。

支持 OpenAI、阿里云、Ollama 本地模型等多种嵌入服务，知识库也可以作为 MCP 服务器暴露给外部工具调用。

### MCP 工具集成

支持连接任意兼容 MCP 协议的服务器，覆盖 stdio、SSE、Streamable HTTP 三种传输协议。连接后自动获取工具列表和参数定义，AI 可在对话中调用这些工具扩展自身能力，多个独立工具支持并行调用。

### Docker 实验环境

在隔离的 Docker 容器中安全运行实验代码。支持 Docker Compose 多服务编排、Dockerfile 构建以及预定义模板快速启动。内置前端开发模板（Vue、React、Vanilla），支持代码热重载和实时预览，容器端口自动映射到本机。所有命令执行受细粒度权限策略控制。

### SSH 远程连接

管理远程服务器连接，支持交互式终端、命令执行和文件传输（SFTP）。可以将本地实验无缝扩展到远程算力环境。

## 安装

从 [Releases](https://github.com/Tianyi822/Lumina/releases) 页面下载最新版本。

支持平台：
- macOS（`.dmg`）
- Windows（`.exe`）

## 开源协议

[GPL-3.0](LICENSE)

## 参与贡献

欢迎提交 Pull Request。Commit message 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。
