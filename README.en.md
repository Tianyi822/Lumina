<div align="center">

# Lumina

**A research-oriented paper reading tool — read, annotate, and retrieve in one place.**

[![Release](https://img.shields.io/github/v/release/Tianyi822/Lumina)](https://github.com/Tianyi822/Lumina/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](https://github.com/Tianyi822/Lumina/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

[English](README.en.md) | [简体中文](README.md)

</div>

---

## Features

### Paper Reading

Import a PDF and Lumina recognizes text, formulas, tables, and figure captions via Zhipu GLM-OCR, then rebuilds double-column papers into a clean, readable single-column layout. A table-of-contents panel jumps straight to any section, with full-text search, KaTeX formula rendering, and horizontal drag-scrolling for wide tables — plus a one-click switch back to the original PDF for comparison. Reading progress (including zoom level and translation toggle) is remembered, and all paper data stays on your device.

![Paper reading: rebuilt layout with AI chat alongside](screenshots/hero.png)

### Bilingual Translation

Translate the full paper with one click: the translation appears paragraph by paragraph beneath the original text, can be toggled at any time, and figure captions are translated too. Translation runs on your own OpenAI-compatible model — you can assign a dedicated translation model for paper reading. Individual paragraphs can be retranslated on demand, highlights made in the translation stay in sync with the original, and the translation toggle state is remembered along with your reading progress.

![Bilingual translation: paragraph-level alignment of original and translation](screenshots/translation.png)

### Highlights & Notes

Highlight any passage in blue, yellow, or orange, and attach notes to what you read. Notes are anchored to the text with semantic anchors, so they stay put as you scroll — and they are automatically collected into the file pool, ready to be mounted into your knowledge base for later retrieval.

![Highlights and notes: attach a note to selected text](screenshots/annotation.png)

### Figure Explorer

Figures with captions are automatically extracted from the paper and gathered into a browsable gallery panel. Click to open a floating preview window — draggable, resizable, and pinnable for side-by-side reference, with arrow keys to move between figures. When translation is on, captions show in the translated language too.

![Figure explorer: browse all figures of a paper](screenshots/figures.png)

### AI-Powered Reading

Ask questions while you read — the AI retrieves from the paper's original text and translation on demand, so answers stay grounded in what you're studying. Select any passage to quote it directly in your question, or attach documents and images. Works with any OpenAI-compatible endpoint, supports multiple providers with quick switching, shows the full reasoning process of thinking models, and surfaces token usage and cache hit rate for every answer.

![AI-powered reading: structured answers grounded in the paper](screenshots/ai-chat.png)

### Smart Agent

For complex questions in paper conversations, the AI automatically enters plan-execute mode: it plans its own steps, calls tools as needed, and keeps reasoning from intermediate results — with plan steps and progress visible in real time and automatic retries on failure. Under the hood is a ReAct loop capped at 30 iterations with a 60,000-token budget; every tool call's parameters, results, and latency can be expanded and inspected, so results stay traceable.

*📷 Reserved for smart agent screenshot*

### Knowledge Base

Import PDFs, Word, Excel, PowerPoint, Markdown, TXT, CSV, and more — Lumina extracts, chunks, and vectorizes the content for you. Each knowledge base gets its own embedding model (presets for OpenAI, local Ollama, and Alibaba Cloud Bailian, plus any OpenAI-compatible service) and chunking strategy, with chunk counts, indexing progress, and storage usage visible at a glance — and a built-in search test panel to verify recall quality. Once you select target bases in a conversation, the AI decides on its own whether — and what — to search, instead of blindly scanning everything. Notes taken while reading papers are collected here too. Your knowledge base can also be exposed as an MCP server for external apps like Claude Desktop with one click.

![Knowledge base: document management and search testing](screenshots/knowledge.png)

### Writing Workspace

A distraction-free rich-text editor for drafting your own work: a slash menu inserts a dozen block types including headings, lists, tables, code blocks, and footnotes; inline and block LaTeX formulas render live via KaTeX; an outline panel keeps structure in view; documents can be organized into folders; and auto-save status is always visible. AI writing assistance is at your side — select text to rewrite or continue it, and review AI-generated edit suggestions right in the editor, accepting or rejecting them one by one. Export to Word, PDF, or Markdown whenever you're ready, with formulas and footnotes preserved as native Word elements.

![Writing workspace: document list and editor](screenshots/writer.png)

### Tool Extensions

Connect external tool services over MCP (Model Context Protocol) via stdio, SSE, or Streamable HTTP, and paste a Claude Desktop-style JSON config to get started quickly — each server can be tested individually. Once connected, the AI can call multiple tools in parallel during conversations to extend its capabilities, and built-in call statistics keep call volume, success rate, and latency distribution in view.

![Tool extensions: MCP server configuration and call statistics](screenshots/mcp.png)

### End-to-End Encrypted Sync

Five kinds of data — papers, conversations, knowledge bases, documents, and settings — stay in sync across your devices: remote changes arrive over WebSocket in real time, with a 60-second polling fallback, and per-domain sync details are always visible. Everything is end-to-end encrypted on your device with XChaCha20-Poly1305 before upload, with keys derived from your password via Argon2id — the server only ever stores ciphertext and can never read your content. Sign in on a new device with the same account, enter a six-digit pairing code to merge into the sync group, and large files transfer in encrypted chunks.

![Sync connection setup](screenshots/sync-connection.png)

![Sync group pairing and device management](screenshots/sync-pairing.png)

![Per-domain sync details](screenshots/sync-domains.png)

### Themes & Languages

A carefully tuned dark theme (the default) for late-night reading and a light theme for bright days, with an optional follow-system switch; themes are preloaded before the UI renders, so switching never flashes. The interface is available in Chinese and English, follows your system language until you choose one, and switches take effect immediately.

![Theme and language settings](screenshots/appearance.png)

---

## Download

Grab the latest release from the [Releases](https://github.com/Tianyi822/Lumina/releases) page.

- macOS (`.dmg`)
- Windows (`.exe`)

> **Note:** Paper recognition (OCR) and AI features require configuring the corresponding API keys in Settings after your first launch.

---

## Self-Hosted Sync Server

Multi-device sync is powered by the open-source relay service **[Lumina-Relay](https://github.com/Tianyi822/Lumina-Relay)**.

- All data is end-to-end encrypted on your device before upload; the server only stores ciphertext and cannot see your content.
- The server is open source, but you need to **deploy it yourself** — Lumina does not provide a public hosted server.

---

## License

[GPL-3.0](LICENSE)

## Contributing

Pull requests are welcome. Please follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages.
