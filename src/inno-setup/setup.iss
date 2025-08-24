#include "utils.iss"
#include "config.iss"

#define public DEPENDENCIES "..\..\dependencies"
#define public INNOSRC "."
#define public WEBSRC "..\web"
#define public SCRIPTSSRC "..\scripts"

#define AppServiceName "7 Days To Die Dedicated Server Plus"
#define AppName "7DTD-DS-P"
#define AppType "Setup"
#define AppVersion "1.0.2"
#define AppPublisher "waynechen251"
#define AppURL "https://github.com/waynechen251/7-days-to-die-dedicated-server-plus"

[Setup]
AppId={{9F8BAD29-7449-4498-896D-23716AB4C529}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=LICENSE.txt
PrivilegesRequired=admin
OutputDir=..\web\
OutputBaseFilename={#AppName}-{#AppType}({#AppVersion})
SetupIconFile=7dtd_icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "Languages\English.isl"
Name: "chinesesimplified"; MessagesFile: "Languages\ChineseSimplified.isl"
Name: "chinesetraditional"; MessagesFile: "Languages\ChineseTraditional.isl"

[Dirs]
Name: "{app}\steamcmd"
Name: "{app}\scripts"
Name: "{app}\dependencies"
Name: "{app}\public"
Name: "{app}\logs"

[Icons]
Name: "{group}\{cm:ProgramOnTheWeb,{#AppName}}"; Filename: "{#AppURL}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"

[Files]
Source: "{#DEPENDENCIES}\nssm-2.24\win64\nssm.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DEPENDENCIES}\steamcmd\*"; DestDir: "{app}\steamcmd"; Flags: ignoreversion recursesubdirs
Source: "{#DEPENDENCIES}\Amazon Root CA 1.crt"; DestDir: "{app}\dependencies"; Flags: ignoreversion
Source: "{#DEPENDENCIES}\VC_redist.x64.exe"; DestDir: "{app}\dependencies"; Flags: ignoreversion
Source: "{#SCRIPTSSRC}\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs
Source: "{#WEBSRC}\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs
Source: "{#WEBSRC}\server.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#WEBSRC}\server.sample.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#INNOSRC}\LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion

[Code]
procedure CurPageChanged(CurPageID: Integer);
begin

  if CurPageID = wpPreparing then
    begin

      Log('CurPageChanged: wpPreparing');

    end;

  if CurPageID = wpInstalling then
    begin

      Log('CurPageChanged: wpInstalling');

    end;

end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;

begin

  Log('CurStepChanged: CurStep=' + IntToStr(Ord(CurStep)));

  // 執行文件安裝的主要步驟
  if CurStep = ssinstall then
    begin

      Exec('cmd.exe', '/C net stop {#AppName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec('cmd.exe', '/C sc delete {#AppName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

      Exec('{app}\dependencies\VC_redist.x64.exe', '/passive /norestart', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
      Exec('cmd.exe', '/C certutil -addstore -f Root "{app}\dependencies\Amazon Root CA 1.crt"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    end;

  // 文件安裝結束後的步驟
  if CurStep = ssPostInstall then
    begin

      Log('CurStepChanged: ssPostInstall');

      Log('CurStepChanged: ssDone');

      // 安裝服務(注意: 路徑與參數分開)
      Exec(ExpandConstant('{app}\nssm.exe'),
        'install {#AppName} ' + '"' + ExpandConstant('{app}\server.exe') + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

      // 設定顯示名稱
      Exec(ExpandConstant('{app}\nssm.exe'),
        'set {#AppName} DisplayName "' + ExpandConstant('{#AppServiceName}') + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

      // 設定工作目錄
      Exec(ExpandConstant('{app}\nssm.exe'),
        'set {#AppName} AppDirectory "' + ExpandConstant('{app}') + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

      // 設定輸入 / 輸出 / 錯誤日誌
      Exec(ExpandConstant('{app}\nssm.exe'),
        'set {#AppName} AppStdout "' + ExpandConstant('{app}\logs\stdout.log') + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );
      Exec(ExpandConstant('{app}\nssm.exe'),
        'set {#AppName} AppStderr "' + ExpandConstant('{app}\logs\stderr.log') + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );
      
      Exec(ExpandConstant('{app}\nssm.exe'),
        'set {#AppName} AppRotateFiles 0',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

      // 設定啟動模式為自動
      Exec('sc.exe',
        'config {#AppName} start= auto',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

      // 註冊防火牆
      AddPortsInFirewall('{#AppServiceName}', WebPortInput.Text);

      Exec('powershell.exe',
        '-ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\json-helper.ps1') + '" ' +
        '-jsonPath "' + ExpandConstant('{app}\server.json') + '" ' +
        '-webPort "' + WebPortInput.Text + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

    end;

  // 最後的安裝完成步驟
  if CurStep = ssDone then
    begin

      // 設定註冊表
      RegWriteStringValue(HKLM, 'Software\7DTD-DS-P', 'InstallPath', ExpandConstant('{app}'));
      RegWriteStringValue(HKLM, 'Software\7DTD-DS-P', 'WebPort', WebPortInput.Text);

      // 啟動服務(如果需要安裝完成後直接啟動)
      Exec('cmd.exe', '/C net start {#AppName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

      // 開啟瀏覽器
      Exec('cmd.exe', '/C start http://localhost:' + WebPortInput.Text, '', SW_HIDE, ewNoWait, ResultCode);

    end;

end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;

begin

  // 解除安裝前
  if CurUninstallStep = usUninstall then
  begin

    Log('CurUninstallStepChanged: 停止並刪除服務 {#AppName}');
    Exec('cmd.exe', '/C net stop {#AppName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('cmd.exe', '/C sc delete {#AppName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="' + ExpandConstant('{#AppServiceName}') + '"', ExpandConstant('{sys}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
    RegDeleteKeyIncludingSubkeys(HKLM, 'Software\7DTD-DS-P');

  end;

end;

// 初始化安裝向导
procedure InitializeWizard();
var
  ResultCode: Integer;
begin
  Log('InitializeWizard');

  // 提示使用者安裝程式會停止服務，請先手動關閉遊戲伺服器
  if MsgBox('安裝程式將會停止伺服器服務。請先手動關閉正在執行的遊戲伺服器。是否要繼續？',
            mbConfirmation, MB_YESNO) <> IDYES then
  begin
    MsgBox('安裝已取消。請在關閉遊戲伺服器後重新執行安裝。', mbInformation, MB_OK);
    Abort;
  end;

  Exec('cmd.exe', '/C net stop {#AppName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  CreateConfigPage();
end;

// 下一步按鈕點擊事件
function NextButtonClick(CurPageID: Integer): Boolean;
var CanPass: Boolean;

begin

  Log('NextButtonClick: CurPageID=' + IntToStr(CurPageID));

  CanPass := True;

  if Assigned(ConfigPage) and (CurPageID = ConfigPageID) then
  begin

    if ConfigCheck() = False then
    begin

      CanPass := False;
      Exit;

    end;

  end;

  if CanPass then
  begin

    Result := True;

  end
  else
  begin

    Result := False;

  end;
    
end;