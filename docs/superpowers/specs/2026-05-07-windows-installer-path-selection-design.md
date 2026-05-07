# Windows 安装程序路径选择设计

## 背景

Windows 用户在安装时需要两个独立的路径选择：
1. **安装路径**：应用程序二进制文件的安装位置
2. **数据路径**：用户数据的存储位置，替代默认的 `~/.lumina/`

macOS 使用 DMG 安装方式，不需要此功能。

## 需求

| 项目 | 说明 |
|------|------|
| 安装路径选择 | Windows 安装时必须出现目录选择页面 |
| 数据路径选择 | Windows 安装时必须出现数据目录选择页面，替代整个 `.lumina/` |
| 路径传递 | 通过注册表 `HKCU\Software\Lumina\DataPath` 传递给应用 |
| 安装后修改 | 不支持，仅安装时选择一次 |
| macOS | 不做任何改变 |

## 实现方案

### 1. electron-builder.yml —— NSIS 配置

文件：`electron-builder.yml`

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  include: build/installer.nsh
  artifactName: ${name}-${version}-${arch}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
```

关键字段：
- `oneClick: false`：强制显示安装步骤页面（含目录选择）
- `allowToChangeInstallationDirectory: true`：启用安装路径选择
- `include: build/installer.nsh`：注入自定义 NSIS 宏，添加数据目录选择页

### 2. build/installer.nsh —— 自定义安装页

此文件定义 NSIS 宏，在安装流程中插入数据目录选择页面：

- **页面位置**：紧随安装路径选择页之后
- **默认值**：`%USERPROFILE%\.lumina`
- **写入注册表**：`WriteRegStr HKCU "Software\Lumina" "DataPath" "<用户选择的路径>"`

NSIS 宏利用 `customPageAfterInstall` 或标准自定义页面机制实现。

### 3. configPaths.ts —— 读取注册表

文件：`src/main/services/config/configPaths.ts`

修改 `getConfigDirPath()` 函数：

- Windows 平台下，优先调用 `reg query` 读取 `HKCU\Software\Lumina\DataPath`
- 注册表值存在且格式合法，则使用该路径
- 注册表不存在或读取失败，回退到 `app.getPath('home') + '/.lumina'`
- macOS/Linux 跳过注册表逻辑，行为不变

读注册表实现：`child_process.execSync('reg query HKCU\\Software\\Lumina /v DataPath')`，解析输出获取路径字符串。

### 4. 边界情况

| 场景 | 处理 |
|------|------|
| 注册表键不存在（首次运行/旧版升级/非 Windows） | 回退到 `~/.lumina/` |
| 注册表指向的目录不存在 | `mkdirSync({ recursive: true })` 自动创建 |
| 目录创建失败（权限不足） | 回退到 `~/.lumina/`，记录 warning 日志 |
| 路径包含非 ASCII 字符 | `reg query` 输出可能为 UTF-16，需处理编码 |
| 完整 Windows 路径（含盘符） | 直接使用，不做转换 |
| 卸载时注册表清理 | NSIS 卸载脚本中删除 `HKCU\Software\Lumina\DataPath` |

## 影响范围

| 文件 | 改动 |
|------|------|
| `electron-builder.yml` | 新增 `oneClick`、`allowToChangeInstallationDirectory`、`include` |
| `build/installer.nsh` | 新建，自定义 NSIS 页面 + 注册表写入 |
| `src/main/services/config/configPaths.ts` | `getConfigDirPath()` 增加 Windows 注册表读取分支 |

## 不影响

- macOS / Linux 打包及运行行为
- 现有的配置加载、日志、知识库等服务（它们都通过 `getConfigDirPath()` / `getKnowledgeDirPath()` 间接获取路径，无需改动）
- 用户数据迁移（安装时选择空目录或新目录，不涉及迁移）
