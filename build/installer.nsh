; Lumina 自定义 NSIS 安装脚本
; 在安装路径选择页面之后插入数据目录选择页面

!include LogicLib.nsh

Var DataDir
Var DataDirControl

; 默认数据目录
StrCpy $DataDir "$PROFILE\.lumina"

; 自定义页面：选择数据目录
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

  ${NSD_CreateDirRequest} 0 20u 75% 12u $DataDir
  Pop $DataDirControl

  ${NSD_CreateBrowseButton} 76% 20u 24% 12u "浏览..."
  Pop $0
  ${NSD_OnClick} $0 OnBrowseButton

  nsDialogs::Show
FunctionEnd

Function OnBrowseButton
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

; 安装完成后写入注册表
Section
  WriteRegStr HKCU "Software\Lumina" "DataPath" "$DataDir"
SectionEnd

; 卸载时清理注册表
Section Uninstall
  DeleteRegValue HKCU "Software\Lumina" "DataPath"
SectionEnd
