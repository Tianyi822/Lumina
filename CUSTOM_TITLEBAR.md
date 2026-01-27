# 自定义窗口标题栏功能

## 概述

基于 VS Code 的设计理念，实现了一个跨平台的自定义窗口标题栏功能，提供原生体验和完整的窗口控制能力。

## 实现的功能

### 1. 窗口控制按钮（"三大键"）

- **关闭按钮**：点击关闭窗口
- **最小化按钮**：点击最小化窗口到任务栏/Dock
- **最大化/还原按钮**：点击切换窗口最大化状态，图标根据状态动态变化

### 2. 跨平台样式适配

#### macOS
- 使用 `titleBarStyle: 'hidden'` 保留原生窗口控制按钮区域
- 自定义红(关闭)、黄(最小化)、绿(最大化)三个圆点按钮
- 圆点尺寸：12x12px，间距 8px
- 悬停时显示内部符号(×, −, +/↺)
- 完全符合 macOS Human Interface Guidelines

#### Windows/Linux
- 使用 `frame: false` 完全移除系统标题栏
- 矩形按钮位于标题栏右侧
- 按钮宽度：46px，自适应高度
- 悬停效果：背景色变化，关闭按钮悬停显示红色(#e81123)
- 使用 SVG 图标显示最大化/还原状态

### 3. 窗口拖动功能

- 整个标题栏区域可通过 `-webkit-app-region: drag` 拖动
- 按钮区域通过 `-webkit-app-region: no-drag` 排除拖动
- 确保用户体验流畅自然

### 4. 实时状态同步

- 监听窗口最大化状态变化事件
- 自动更新最大化按钮图标
- 使用 IPC 事件机制确保状态一致性

## 技术实现

### 架构设计

```
┌─────────────────────────────────────────┐
│           TitleBar.vue                  │  ← 自定义标题栏组件
├─────────────────────────────────────────┤
│   Preload API (windowApi)              │  ← IPC 桥接层
├─────────────────────────────────────────┤
│   IPC Handlers (windowHandlers)        │  ← 主进程处理器
├─────────────────────────────────────────┤
│   Electron BrowserWindow               │  ← 窗口管理
└─────────────────────────────────────────┘
```

### 核心文件

1. **主进程**
   - `src/main/core/window.ts` - 窗口创建，配置 `frame: false`
   - `src/main/ipc/handlers/windowHandlers.ts` - 窗口控制 IPC 处理器

2. **预加载脚本**
   - `src/preload/apis/window.ts` - 窗口控制 API
   - `src/preload/index.ts` - 注册 windowApi

3. **渲染进程**
   - `src/renderer/src/components/TitleBar.vue` - 自定义标题栏组件
   - `src/renderer/src/App.vue` - 集成标题栏到应用
   - `src/renderer/src/themes/terminal.css` - 标题栏主题变量

### IPC 通信协议

#### 渲染进程 → 主进程

```typescript
// 最小化窗口
await window.api.window.minimize()

// 最大化/还原窗口
await window.api.window.maximize()

// 关闭窗口
await window.api.window.close()

// 查询窗口状态
const isMaximized = await window.api.window.isMaximized()
```

#### 主进程 → 渲染进程（事件）

```typescript
// 监听窗口最大化状态变化
const unsubscribe = window.api.window.onMaximizedChanged((isMaximized) => {
  console.log('窗口最大化状态:', isMaximized)
})

// 取消监听
unsubscribe()
```

## 主题系统集成

### CSS 变量

标题栏使用主题系统中的 CSS 变量，确保配色一致：

```css
/* 标题栏专用变量 */
--title-bar-height: 32px;          /* macOS 标准标题栏高度 */
--title-bar-bg: var(--theme-bg);   /* 背景色 */
--title-bar-border: var(--theme-border);  /* 边框色 */
--title-bar-text: var(--theme-text-secondary);  /* 文字颜色 */
--title-bar-text-hover: var(--theme-text);  /* 悬停文字颜色 */
```

### 主题变量引用

标题栏样式通过 `var(--theme-*)` 变量引用主题系统：
- 背景色：`--theme-bg`
- 边框色：`--theme-border`
- 文字颜色：`--theme-text`, `--theme-text-secondary`
- 悬停背景：`--theme-bg-hover`

确保主题配置变更时标题栏样式自动同步。

## 设计参考

### VS Code 的设计理念

参考了 VS Code 的以下设计模式：

1. **Part 架构**：标题栏作为独立的 Part 组件，职责单一
2. **多窗口支持**：通过 IPC 事件机制支持多窗口状态同步
3. **平台适配**：根据 `process.platform` 动态调整样式和行为
4. **主题系统**：使用 CSS 变量实现主题一致性

### 关键设计决策

1. **macOS 保留原生按钮区域**
   - 使用 `titleBarStyle: 'hidden'` 而非 `frame: false`
   - 避免覆盖系统原生的窗口控制按钮
   - 保持 macOS 用户体验的一致性

2. **Windows/Linux 完全自定义**
   - 使用 `frame: false` 移除系统标题栏
   - 完全自定义窗口控制按钮
   - 提供更大的设计灵活性

3. **响应式状态管理**
   - 使用 Vue 3 Composition API
   - 通过 IPC 事件监听窗口状态变化
   - 自动更新按钮图标和提示文字

## 使用方法

### 启用自定义标题栏

自定义标题栏已默认启用，无需额外配置。窗口在创建时自动应用无边框模式。

### 自定义标题栏外观

可以通过修改 `src/renderer/src/themes/terminal.css` 中的 CSS 变量来自定义标题栏外观：

```css
:root {
  /* 调整标题栏高度 */
  --title-bar-height: 40px;

  /* 自定义颜色 */
  --title-bar-bg: #1a1a1a;
  --title-bar-border: #333;
}
```

### 显示/隐藏标题栏

如需隐藏标题栏，可以修改 `App.vue`：

```vue
<template>
  <div class="app-container">
    <!-- 注释掉标题栏组件 -->
    <!-- <TitleBar /> -->

    <div class="app-layout">
      <!-- ... -->
    </div>
  </div>
</template>
```

## 平台特性说明

### macOS
- 标题栏高度：32px（系统标准）
- 按钮样式：圆形，12x12px
- 按钮颜色：#ff5f57（红）、#febc2e（黄）、#28c840（绿）
- 悬停效果：显示内部符号，透明度 50%
- 点击效果：亮度降低至 90%

### Windows
- 标题栏高度：32px（可自定义）
- 按钮样式：矩形，46px 宽
- 悬停效果：背景色变为 `--theme-bg-hover`
- 关闭按钮悬停：背景色变为 #e81123
- 图标：SVG 矢量图标

### Linux
- 与 Windows 保持一致
- 可根据桌面环境主题自动适配

## 注意事项

1. **窗口拖动**
   - 标题栏区域默认可拖动
   - 按钮区域不参与拖动
   - 确保交互元素设置 `-webkit-app-region: no-drag`

2. **主题更新**
   - 标题栏样式通过 CSS 变量控制
   - 主题配置变更时无需手动更新标题栏
   - CSS 变量自动响应主题变化

3. **多窗口支持**
   - 当前实现针对主窗口
   - 如需支持多窗口，需扩展窗口处理器
   - 使用窗口 ID 区分不同窗口实例

4. **性能优化**
   - 窗口状态变化通过 IPC 事件推送
   - 避免轮询窗口状态
   - 使用事件监听器自动清理

## 扩展开发

### 添加自定义标题内容

修改 `TitleBar.vue`，在标题栏中添加自定义内容：

```vue
<template>
  <div class="title-bar" :class="{ 'is-mac': isMac }">
    <!-- 窗口控制按钮 -->
    <div class="title-bar-controls">...</div>

    <!-- 自定义内容 -->
    <div class="title-bar-custom">
      <slot name="center">默认标题</slot>
    </div>

    <!-- 窗口拖动区域 -->
    <div class="title-bar-drag-region"></div>
  </div>
</template>
```

### 添加双击标题栏行为

```typescript
function handleDoubleClick(): void {
  if (isMac.value) {
    // macOS: 双击标题栏最大化/还原
    handleMaximize()
  } else {
    // Windows/Linux: 可自定义行为
    handleMaximize()
  }
}
```

在模板中添加：

```vue
<div class="title-bar" @dblclick="handleDoubleClick">
  <!-- ... -->
</div>
```

## 总结

自定义窗口标题栏功能成功实现了：

✅ 跨平台窗口控制（macOS/Windows/Linux）
✅ 符合各平台设计规范的按钮样式
✅ 流畅的窗口拖动体验
✅ 实时窗口状态同步
✅ 与主题系统无缝集成
✅ 类型安全的 TypeScript 实现
✅ 基于 VS Code 的成熟架构模式

所有功能均已通过类型检查和构建测试，可以安全使用。
