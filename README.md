# Lumina

面向科研的桌面端论文阅读工具，让阅读、思考与检索在同一界面中完成。

[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](https://github.com/Tianyi822/Lumina/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## 核心功能

### 论文阅读

导入 PDF 论文后，Lumina 会自动识别其中的文字、公式、表格与图注，将内容整理为清晰可读的版式，方便逐段阅读。阅读时可以为任意段落添加高亮与笔记，笔记与原文位置自动关联，随时回顾。

论文中的图表会被单独提取展示，阅读过程中所有数据本地保存，保护研究隐私。

### AI 交互阅读

阅读论文时，可以直接引用原文段落向 AI 提问，AI 结合论文上下文给出回答，适合精读、文献综述和思路探讨。支持配置多个服务商并按需切换，兼容主流大模型，也支持展开查看推理模型的完整思考过程。

### 智能助手

面对复杂问题时，AI 能自主规划步骤、按需调用工具、根据中间结果继续推理，逐步完成多步任务。工具调用与思考过程全程可见，结果可追溯。

### 知识库

将 PDF、Word、Markdown、TXT、CSV 等文档导入知识库后，Lumina 会自动提取并整理内容。在对话中，AI 会自主判断是否需要检索知识库，以及检索哪些内容，而不是机械地全文搜索。

支持接入多种嵌入服务，知识库也可以作为工具开放给外部应用调用。

### 工具扩展

支持连接符合通用协议的外部工具服务，连接后 AI 可在对话中调用这些工具扩展能力，多个独立工具支持并行调用。

### 远程实验室

通过 SSH 连接远程服务器，在应用内直接使用交互式终端、执行命令、传输文件，将本地研究无缝扩展到远程算力环境。

## 安装

从 [Releases](https://github.com/Tianyi822/Lumina/releases) 页面下载最新版本。

支持平台：

- macOS（`.dmg`）
- Windows（`.exe`）

## 开源协议

[GPL-3.0](LICENSE)

## 参与贡献

欢迎提交 Pull Request。Commit message 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。
