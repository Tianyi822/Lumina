; Lumina 自定义 NSIS 安装脚本
; 增强 Windows 安装流程：支持自定义安装路径和数据目录选择

!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh

Var DataDir
Var DataDirControl

; 默认数据目录
StrCpy $DataDir "$PROFILE\.lumina"

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

  ${NSD_CreateLabel} 0 0 100% 12u "选择用户数据的存储目录。此目录将替代默认的 %USERPROFILE%\.lumina。"
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
FunctionEnd

; ============================================================
; 安装完成后写入注册表和配置
; ============================================================
Section
  ; 写入数据目录路径到注册表
  WriteRegStr HKCU "Software\Lumina" "DataPath" "$DataDir"
SectionEnd

; 卸载时清理注册表
Section Uninstall
  DeleteRegValue HKCU "Software\Lumina" "DataPath"
SectionEnd
