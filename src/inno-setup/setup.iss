#include "utils.iss"
#include "config.iss"

#define public DEPENDENCY "..\..\dependency"
#define public INNOSRC "."
#define public WEBSRC "..\web"
#define public SCRIPTSSRC "..\scripts"

#define AppServiceName "7 Days To Die Dedicated Server Plus"
#define AppName "7DTD-DS-P"
#define AppType "Setup"
#define AppVersion "1.0.0"
#define AppPublisher "waynechen251"
#define AppURL "https://github.com/waynechen251/7-days-to-die-dedicated-server-plus"

[Setup]
AppId={{9F8BAD29-7449-4498-896D-23716AB4C529}
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
OutputDir=..\..\
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
Name: "{app}\7-Zip"
Name: "{app}\nssm"
Name: "{app}\scripts"
Name: "{app}\dependency"
Name: "{app}\public"
Name: "{app}\logs"

[Icons]
Name: "{group}\{cm:ProgramOnTheWeb,{#AppName}}"; Filename: "{#AppURL}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"

[Files]
Source: "{#DEPENDENCY}\7-Zip\*"; DestDir: "{app}\7-Zip"; Flags: ignoreversion recursesubdirs
Source: "{#DEPENDENCY}\nssm-2.24\win64\nssm.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DEPENDENCY}\steamcmd\steamcmd.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DEPENDENCY}\Amazon Root CA 1.crt"; DestDir: "{app}\dependency"; Flags: ignoreversion
Source: "{#DEPENDENCY}\VC_redist.x64.exe"; DestDir: "{app}\dependency"; Flags: ignoreversion
Source: "{#SCRIPTSSRC}\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs
Source: "{#WEBSRC}\public\index.html"; DestDir: "{app}\public"; Flags: ignoreversion
Source: "{#WEBSRC}\server.exe"; DestDir: "{app}"; Flags: ignoreversion
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

      Exec('{app}\dependency\VC_redist.x64.exe', '/passive /norestart', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
      Exec('cmd.exe', '/C certutil -addstore -f Root "{app}\dependency\Amazon Root CA 1.crt"', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);

    end;

  // 文件安裝結束後的步驟
  if CurStep = ssPostInstall then
    begin

      Log('CurStepChanged: ssPostInstall');

      Log('CurStepChanged: ssDone');

      // 安裝服務（注意：路徑與參數分開）
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

      // 開啟日誌輪替
      Exec(ExpandConstant('{app}\nssm.exe'),
        'set {#AppName} AppRotateFiles 1',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

      // 設定啟動模式為手動
      Exec('sc.exe',
        'config {#AppName} start= demand',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

      // 註冊防火牆
      AddPortsInFirewall('{#AppServiceName}', WebPortInput.Text);

      // 寫入 server.json 配置 json-helper.ps1
      // powershell.exe -ExecutionPolicy Bypass -File ".\json-helper.ps1" -jsonPath "json.json" -webPort "1" -game_serverIp "2" -game_serverPort "3" -game_serverTelnetPort "4" -game_serverTelnetPassword "5"
      Exec('powershell.exe',
        '-ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\json-helper.ps1') + '" ' +
        '-jsonPath "' + ExpandConstant('{app}\server.json') + '" ' +
        '-webPort "' + WebPortInput.Text + '" ' +
        '-game_serverIp "' + GameServerPortInput.Text + '" ' +
        '-game_serverPort "' + GameServerTelnetPortInput.Text + '" ' +
        '-game_serverTelnetPort "' + GameServerTelnetPortInput.Text + '" ' +
        '-game_serverTelnetPassword "' + GameServerTelnetPasswordInput.Text + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode
      );

    end;

  // 最後的安裝完成步驟
  if CurStep = ssDone then
    begin

      // 啟動服務（如果需要安裝完成後直接啟動）
      Exec('cmd.exe', '/C net start {#AppName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

      // 開啟瀏覽器
      Exec('cmd.exe', '/C start http://localhost:26902', '', SW_HIDE, ewNoWait, ResultCode);

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

  end;

end;

// 初始化安裝向导
procedure InitializeWizard();
begin

  Log('InitializeWizard');

  // 配置页面
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