; 手动安装（包含同版本覆盖）生成新安装标记。应用内 --updated 在旧版本卸载前
; 读出标记，安装完成后写回；不依赖用户数据是否被保留。
!ifndef BUILD_UNINSTALLER
Var DawnOnboardingInstallId

!macro customInit
  StrCpy $DawnOnboardingInstallId ""
  ${If} ${isUpdated}
    FileOpen $0 "$INSTDIR\.dawn-onboarding-install-id" r
    ${IfNot} ${Errors}
      FileRead $0 $DawnOnboardingInstallId
      FileClose $0
    ${EndIf}
    ClearErrors
  ${EndIf}
!macroend

!macro customInstall
  ${If} $DawnOnboardingInstallId == ""
    System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
    ${If} $1 != 0
      Abort "Could not create installation identifier."
    ${EndIf}
    StrCpy $DawnOnboardingInstallId $0
  ${EndIf}
  ClearErrors
  FileOpen $0 "$INSTDIR\.dawn-onboarding-install-id" w
  ${If} ${Errors}
    Abort "Could not save installation identifier."
  ${EndIf}
  FileWrite $0 $DawnOnboardingInstallId
  ${If} ${Errors}
    FileClose $0
    Abort "Could not save installation identifier."
  ${EndIf}
  FileClose $0
!macroend
!endif
