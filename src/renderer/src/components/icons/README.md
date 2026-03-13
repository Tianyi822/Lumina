# SVG 图标组件

统一的 SVG 图标管理组件，用于在项目中复用图标，提高代码可维护性和一致性。

## 使用方法

### 基础用法

```vue
<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
</script>

<template>
  <!-- 基础用法 -->
  <SvgIcon name="settings" />

  <!-- 自定义尺寸 -->
  <SvgIcon name="close" :size="12" />
  <SvgIcon name="refresh" size="24px" />

  <!-- 自定义颜色 -->
  <SvgIcon name="delete" color="#ff4444" />
  <SvgIcon name="info" :color="isActive ? 'var(--theme-accent)' : 'currentColor'" />

  <!-- 加载动画 -->
  <SvgIcon name="spinner" :spin="true" />

  <!-- 带点击事件 -->
  <SvgIcon name="refresh" class="clickable" @click="handleRefresh" />
</template>
```

### 全局注册（可选）

如果希望在所有组件中直接使用 `<SvgIcon>` 而无需导入，可以在 `main.ts` 中全局注册：

```typescript
// src/renderer/src/main.ts
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

app.component('SvgIcon', SvgIcon)
```

## 可用图标

### 系统图标

| 图标名称 | 说明 |
|---------|------|
| `settings` | 设置齿轮 |
| `sidebar-toggle` | 侧边栏切换 |
| `window-maximize` | 窗口最大化 |
| `window-restore` | 窗口还原 |

### 操作图标

| 图标名称 | 说明 |
|---------|------|
| `check` | 勾选 |
| `close` | 关闭 |
| `refresh` | 刷新 |
| `delete` | 删除（垃圾桶） |
| `export` | 导出 |
| `upload` | 上传 |
| `attachment` | 附件/回形针 |
| `edit` | 编辑 |
| `microphone` | 麦克风 |

### 状态图标

| 图标名称 | 说明 |
|---------|------|
| `info` | 信息提示 |
| `warning` | 警告 |
| `spinner` | 加载动画 |
| `toggle-on` | 开启状态 |
| `toggle-off` | 关闭状态 |
| `thinking` | 思考/推理 |

### 头像图标

| 图标名称 | 说明 |
|---------|------|
| `avatar-user` | 用户头像 |
| `avatar-ai` | AI 头像 |

### 箭头图标

| 图标名称 | 说明 |
|---------|------|
| `arrow-down` | 下拉箭头 |
| `arrow-up` | 上拉箭头 |

### 文件图标

| 图标名称 | 说明 |
|---------|------|
| `file` | 通用文件 |
| `file-pdf` | PDF 文件 |
| `file-txt` | 文本文件 |
| `file-md` | Markdown 文件 |
| `file-doc` | Word 文件 |
| `file-csv` | CSV 文件 |

## Props

| 属性 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `name` | `string` | - | 图标名称（必填） |
| `size` | `number \| string` | `16` | 图标尺寸，数字时单位为 px |
| `color` | `string` | `'currentColor'` | 图标颜色 |
| `spin` | `boolean` | `false` | 是否启用旋转动画 |

## 添加新图标

1. 打开 `icons/index.ts` 文件
2. 根据图标类型添加到对应的分类对象中：
   - `systemIcons` - 系统图标
   - `statusIcons` - 状态图标
   - `actionIcons` - 操作图标
   - `avatarIcons` - 头像图标
   - `arrowIcons` - 箭头图标
   - `fileIcons` - 文件图标

### 图标数据结构

```typescript
interface IconData {
  viewBox: string          // SVG 视图框
  path?: string            // 单个 path 的 d 属性
  paths?: string[]         // 多个 path 的 d 属性数组
  elements?: string        // 原始 SVG 元素字符串（用于复杂结构）
  fill?: string            // 填充颜色（默认 'currentColor'）
  stroke?: string          // 描边颜色（默认 'none'）
  strokeWidth?: number | string  // 描边宽度
}
```

### 添加示例

**简单 fill 类型图标：**

```typescript
myIcon: {
  viewBox: '0 0 1024 1024',
  fill: 'currentColor',
  path: 'M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z'
}
```

**多 path 图标：**

```typescript
myMultiPathIcon: {
  viewBox: '0 0 1024 1024',
  fill: 'currentColor',
  paths: [
    'M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z',
    'M464 336a48 48 0 1 0 96 0 48 48 0 1 0-96 0z'
  ]
}
```

**Stroke 类型图标（使用 elements）：**

```typescript
myStrokeIcon: {
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 2,
  elements: '<circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />'
}
```

## 命名规范

图标命名遵循 `<类别>-<动作/对象>-<变体?>` 格式：

- 系统图标：`settings`、`window-maximize`
- 操作图标：`delete`、`upload`
- 状态图标：`toggle-on`、`spinner`
- 文件图标：`file-pdf`、`file-txt`

## 注意事项

1. **颜色继承**：默认使用 `currentColor`，图标会继承父元素的文本颜色
2. **尺寸单位**：当 `size` 为数字时，自动添加 `px` 单位
3. **旋转动画**：`spin` 属性会添加 1 秒一圈的无限循环旋转动画
4. **SVG 复杂结构**：对于包含 `circle`、`line`、`polyline` 等元素的图标，使用 `elements` 属性
