#define public DEPENDENCY "..\..\dependency"
#define public WEBSRC "..\web"

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
Name: "{app}\nodejs"
Name: "{app}\nssm"
Name: "{app}\scripts"
Name: "{app}\steamcmd"
Name: "{app}\dependency"
Name: "{app}\node_modules"
Name: "{app}\public"
Name: "{app}\logs"

[Icons]
Name: "{group}\{cm:ProgramOnTheWeb,{#AppName}}"; Filename: "{#AppURL}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"

[Files]
Source: "{#DEPENDENCY}\7-Zip\*"; DestDir: "{app}\7-Zip"; Flags: ignoreversion recursesubdirs
; Source: "{#DEPENDENCY}\nginx-1.29.0\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
Source: "{#DEPENDENCY}\nodejs-22.18.0\node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DEPENDENCY}\nssm-2.24\win64\nssm.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DEPENDENCY}\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs
Source: "{#DEPENDENCY}\steamcmd\steamcmd.exe"; DestDir: "{app}\steamcmd"; Flags: ignoreversion
Source: "{#DEPENDENCY}\Amazon Root CA 1.crt"; DestDir: "{app}\dependency"; Flags: ignoreversion
Source: "{#DEPENDENCY}\VC_redist.x64.exe"; DestDir: "{app}\dependency"; Flags: ignoreversion
Source: "LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#WEBSRC}\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs
Source: "{#WEBSRC}\index.html"; DestDir: "{app}\public"; Flags: ignoreversion
Source: "{#WEBSRC}\server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#WEBSRC}\server.sample.json"; DestDir: "{app}"; DestName: "server.json"; Flags: ignoreversion

[Run]
Filename: "{app}\dependency\VC_redist.x64.exe"; Parameters: "/passive /norestart"; Flags: waituntilterminated
Filename: "{cmd}"; Parameters: "/C certutil -addstore -f Root ""{app}\dependency\Amazon Root CA 1.crt"""; Flags: waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "install 7DTD-DS-P """"{app}\node.exe"""" """"{app}\server.js"""""; Flags: waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set 7DTD-DS-P AppDirectory """"{app}"""""; Flags: waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set 7DTD-DS-P AppStdout """"{app}\logs\stdout.log"""""; Flags: waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set 7DTD-DS-P AppStderr """"{app}\logs\stderr.log"""""; Flags: waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set 7DTD-DS-P AppRotateFiles 1"; Flags: waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "start 7DTD-DS-P"; Flags: waituntilterminated
Filename: "{cmd}"; Parameters: "/C start http://localhost:26902"; Flags: waituntilterminated


[UninstallRun]
Filename: "{app}\nssm.exe"; Parameters: "stop 7DTD-DS-P"; Flags: waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "remove 7DTD-DS-P confirm"; Flags: waituntilterminated