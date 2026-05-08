; Lumina 自定义 NSIS 安装脚本
; 增强 Windows 安装流程：支持自定义安装路径和数据目录选择

!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh

Var DataDir
Var DataDirControl
Var InstallDirControl

; ============================================================
; 安装路径选择页面增强
; ============================================================

; 在安装路径选择页面创建时设置默认值
Function .onInit
  ; 设置默认安装路径为 %LocalAppData%\Programs\Lumina（用户级安装）
  ; 如果设置了 perMachine，则使用 ProgramFiles
  ${If} $INSTDIR == ""
    SetShellVarContext current
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Lumina"
  ${EndIf}
  
  ; 设置默认数据目录
  StrCpy $DataDir "$PROFILE\.lumina"
FunctionEnd

; ============================================================
; 自定义页面：选择数据目录
; ============================================================

; 在安装路径页面之后插入数据目录选择页面
Page Custom DataDirPageCreate DataDirPageLeave

Function DataDirPageCreate
  ; 如果之前选择过，保留已选路径
  ${If} $DataDir == ""
    StrCpy $DataDir "$PROFILE\.lumina"
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 24u "选择 Lumina 用户数据的存储目录。$$
此目录将用于存储配置、缓存和本地数据。"
  Pop $0

  ${NSD_CreateLabel} 0 28u 100% 12u "数据目录："
  Pop $0

  ${NSD_CreateDirRequest} 0 42u 75% 12u $DataDir
  Pop $DataDirControl

  ${NSD_CreateBrowseButton} 76% 42u 24% 12u "浏览..."
  Pop $0
  ${NSD_OnClick} $0 OnBrowseDataDirButton

  ${NSD_CreateLabel} 0 60u 100% 24u "提示：建议选择一个具有足够空间的磁盘分区。"
  Pop $0
  SetCtlColors $0 0x666666 transparent

  nsDialogs::Show
FunctionEnd

Function OnBrowseDataDirButton
  nsDialogs::SelectFolderDialog "选择数据存储目录" $DataDir
  Pop $0
  ${If} $0 != "error"
    StrCpy $DataDir $0
    ${NSD_SetText} $DataDirControl $DataDir
  ${EndIf}
FunctionEnd

Function DataDirPageLeave
  ${NSD_GetText} $DataDirControl $DataDir

  ${If} $DataDir == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "请选择数据存储目录，或使用默认路径。"
    Abort
  ${EndIf}

  ; 检查目录是否可写
  CreateDirectory "$DataDir"
  IfFileExists "$DataDir\*.*" +3 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "无法创建或访问数据目录：$DataDir$$
请检查权限或选择其他路径。"
    Abort
FunctionEnd

; ============================================================
; 安装完成后写入注册表和配置
; ============================================================
Section
  ; 写入数据目录路径到注册表
  WriteRegStr HKCU "Software\Lumina" "DataPath" "$DataDir"
  
  ; 写入安装路径到注册表（用于卸载和更新）
  WriteRegStr HKCU "Software\Lumina" "InstallPath" "$INSTDIR"
  
  ; 创建数据目录
  CreateDirectory "$DataDir"
  
  ; 创建数据子目录结构
  CreateDirectory "$DataDir\cache"
  CreateDirectory "$DataDir\config"
  CreateDirectory "$DataDir\logs"
SectionEnd

; ============================================================
; 卸载时清理
; ============================================================
Section Uninstall
  ; 删除注册表项
  DeleteRegValue HKCU "Software\Lumina" "DataPath"
  DeleteRegValue HKCU "Software\Lumina" "InstallPath"
  DeleteRegKey /ifempty HKCU "Software\Lumina"
  
  ; 注意：不自动删除用户数据目录，避免误删用户文件
  ; 如果用户需要删除数据，可以手动删除
SectionEnd
