# Vue → React 迁移 — 总计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Lumina Electron 应用渲染进程从 Vue 3 渐进迁移到 React 19，零回归，每个阶段可独立提交和回滚。

**Architecture:** 双入口点策略 — `index.html`（Vue，默认）和 `index.react.html`（React，测试），通过 Vite 双插件共存，运行时只加载一种框架。Phase 1-4 做基础设施准备（Store/逻辑/样式），Phase 5-8 逐页面迁移 UI，Phase 9 清理切换。

**Tech Stack:** React 19, Zustand, CSS Modules, electron-vite, TypeScript

---

## 阶段总览

| 阶段 | 名称 | 状态 | 开始日期 | 完成日期 | Code Review | 备注 |
|------|------|------|----------|----------|-------------|------|
| P1 | 构建与工具链配置 | ✅ 已完成 | 2026-05-18 | 2026-05-18 | 见下方 | 见下方 |
| P2 | 状态管理迁移 | ⏳ 待开始 | - | - | - | |
| P3 | Composables 逻辑提取 | ⏳ 待开始 | - | - | - | |
| P4 | 样式迁移 | ⏳ 待开始 | - | - | - | |
| P5 | Shell 与公共组件 | ⏳ 待开始 | - | - | - | |
| P6 | 知识库页面 | ⏳ 待开始 | - | - | - | |
| P7 | 实验室页面 | ⏳ 待开始 | - | - | - | |
| P8 | 论文页面 | ⏳ 待开始 | - | - | - | |
| P9 | 清理与切换 | ⏳ 待开始 | - | - | - | |

**状态图例：** ⏳ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 已回滚 | ⏭️ 已跳过

---

## 阶段依赖关系

```
P1 ──→ P2 ──→ P3 ──→ P4 ──→ P5 ──→ P6 ──→ P7 ──→ P8 ──→ P9
                              │       │       │       │
                              │       │       │       └── P6-8 可并行
                              │       │       └── 按复杂度递增
                              │       └── 先简单页面建立信心
                              └── UI 迁移从这里开始
```

P1-P4 必须顺序执行（后续阶段依赖前面的基础设施）。
P6-P8 页面迁移在 P5 完成后可并行（不同页面无依赖），但建议按复杂度递增顺序：知识库 → 实验室 → 论文。

---

## 每个阶段的通用验收流程

1. [ ] 所有步骤按计划文件执行完毕
2. [ ] `yarn typecheck` 通过（零新增错误）
3. [ ] `yarn lint` 通过
4. [ ] `yarn dev`（Vue 入口）功能完整
5. [ ] P5 起增加：`LUMINA_UI=react yarn dev`（React 入口）目标功能正常
6. [ ] 已有测试全部通过
7. [ ] 手动验收清单逐项确认
8. [ ] Code Review（见下方模板）
9. [ ] Git commit

---

## Code Review 模板

每个阶段完成后，在下方记录 Review 结果：

### Phase N Code Review 记录

```
**Review 日期：** YYYY-MM-DD
**Reviewer：** [姓名]
**阶段：** Phase N — [名称]

**变更文件数：** [N]
**新增行数：** [+N]
**删除行数：** [-N]

**检查项：**
- [ ] 所有验收标准通过
- [ ] 无 console.log 残留
- [ ] 无硬编码颜色/间距（使用 --sm-* 变量）
- [ ] IPC 调用路径未变更
- [ ] 新增依赖合理（无冗余）
- [ ] TypeScript 严格模式无报错
- [ ] 无 Vue 残留引用（P4+）
- [ ] CSS 样式与原有视觉一致
- [ ] 持久化兼容（localStorage key 迁移）

**发现的问题：**
1. [问题描述] — [状态：已修复/待修复/已知遗留]

**结论：** [通过 / 需修改后重新审查]
```

---

## 计划文件索引

| 阶段 | 计划文件 |
|------|---------|
| P1 | [2026-05-18-vue-to-react-migration-phase-1.md](2026-05-18-vue-to-react-migration-phase-1.md) |
| P2 | [2026-05-18-vue-to-react-migration-phase-2.md](2026-05-18-vue-to-react-migration-phase-2.md) |
| P3 | [2026-05-18-vue-to-react-migration-phase-3.md](2026-05-18-vue-to-react-migration-phase-3.md) |
| P4 | [2026-05-18-vue-to-react-migration-phase-4.md](2026-05-18-vue-to-react-migration-phase-4.md) |
| P5 | [2026-05-18-vue-to-react-migration-phase-5.md](2026-05-18-vue-to-react-migration-phase-5.md) |
| P6 | [2026-05-18-vue-to-react-migration-phase-6.md](2026-05-18-vue-to-react-migration-phase-6.md) |
| P7 | [2026-05-18-vue-to-react-migration-phase-7.md](2026-05-18-vue-to-react-migration-phase-7.md) |
| P8 | [2026-05-18-vue-to-react-migration-phase-8.md](2026-05-18-vue-to-react-migration-phase-8.md) |
| P9 | [2026-05-18-vue-to-react-migration-phase-9.md](2026-05-18-vue-to-react-migration-phase-9.md) |

---

## 回滚策略

- **任意阶段回滚**：`git revert <phase-commit>`
- **紧急回滚到 Vue**：修改入口指向 `index.html`（一行改动）
- **分支策略**：所有工作在同一分支 `refactor/migrate-vue-to-react` 上进行，每个 Phase 一个 commit

---

## Phase 1 完成记录

### 实际完成内容

严格按照 Phase 1 计划执行，8 个任务全部完成：

| 任务 | 内容 | 状态 |
|------|------|------|
| 1.1 | 安装 React 19 及构建工具依赖 | ✅ |
| 1.2 | electron-vite 配置同时支持 Vue 和 React 插件 | ✅ |
| 1.3 | 创建 React HTML 入口 index.react.html | ✅ |
| 1.4 | 创建 React 入口文件和占位 App 组件 | ✅ |
| 1.5 | 主进程支持 LUMINA_UI 环境变量切换入口 | ✅ |
| 1.6 | TypeScript 配置添加 JSX 支持 | ✅ |
| 1.7 | ESLint 配置覆盖 .tsx 文件 | ✅ |
| 1.8 | Phase 1 最终验收 | ✅ |

### 修改的关键文件

| 文件 | 变更 |
|------|------|
| `package.json` + `yarn.lock` | 新增 react, react-dom, @vitejs/plugin-react, @types/react, @types/react-dom |
| `electron.vite.config.ts` | 添加 react() 插件，与 vue() 共存 |
| `src/renderer/index.react.html` | 新建 React HTML 入口，CSP 与 index.html 一致 |
| `src/renderer/src/main.tsx` | 新建 React JS 入口，含平台 CSS 加载 |
| `src/renderer/src/App.tsx` | 新建占位 App 组件 |
| `src/renderer/src/App.module.css` | 新建占位组件样式（使用 --sm-* Token） |
| `src/main/core/window.ts` | 添加 LUMINA_UI 环境变量控制，支持切换 HTML 入口 |
| `tsconfig.web.json` | 添加 "jsx": "react-jsx"，include 中添加 .tsx 文件 |
| `eslint.config.mjs` | 为 .tsx/.ts/.vue 文件关闭 explicit-function-return-type 规则 |

### Code Review 发现的问题

**审查日期**：2026-05-18，使用 superpowers:code-reviewer agent

#### Important（已修复）
1. `themeStartup.ts` 未在 React HTML 入口加载 → 已添加，防止主题闪烁
2. 平台 CSS（`platform-windows.css`）未在 React 入口加载 → 已在 main.tsx 中添加条件加载

#### Important（暂缓）
3. `index.react.html` 未包含在生产构建输出中 → 暂缓。React 入口在 Phase 1-8 仅供开发测试，Phase 9 切换为默认入口后自然解决。当前不影响开发验证流程。

#### Minor（暂缓）
4. URL 拼接依赖 electron-vite 隐式尾部斜杠 → 已知行为，暂缓
5. `env.d.ts` 无显式 CSS Module 声明 → Vite 内置类型已覆盖
6. 4 个文件有冗余的 eslint-disable 指令 → 可后续清理
7. `lang` 属性不一致 → React 入口已改进，Vue 入口可选修复

### 验收标准达成情况

| 标准 | 状态 |
|------|------|
| `yarn typecheck`（node + web） | ✅ 通过 |
| `yarn lint` | ✅ 通过（0 errors, 4 pre-existing warnings） |
| `yarn build` | ✅ 成功（main + preload + renderer） |
| package.json 含 react, react-dom, @vitejs/plugin-react | ✅ |
| package.json 仍含 vue, pinia（未删除） | ✅ |
| Vue 依赖零变化 | ✅ |

### 风险和注意事项

- **`vue-tsc`**：当前仍用于 web 类型检查。`.tsx` 文件能被 vue-tsc 正确处理（已验证）。Phase 9 切换为 tsc。
- **生产构建**：`index.react.html` 不在生产构建输出中，`LUMINA_UI=react` 仅限开发环境使用。Phase 9 通过重命名解决。
- **ESLint 规则**：`explicit-function-return-type` 已全局关闭。后续 Phase 5 添加 `eslint-plugin-react-hooks`。
- **Git 历史**：8 个 commit，每个任务一个，历史清晰可回滚。

### 是否建议进入下一阶段

✅ 建议进入 Phase 2。Phase 1 基础设施稳固，Vue 入口零回归，所有验证通过。
