; Inno Setup script for Quick Pebble (x64). Build the app first:  npx tauri build --no-bundle
; Then compile this file with ISCC.exe:  iscc scripts\installer_windows.iss
#define MyAppName "Quick Pebble"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Quick Pebble contributors"
#define MyAppExeName "quick-pebble.exe"
#define BuildDir "..\src-tauri\target\release"

[Setup]
AppId={{6F5B3C2A-8D41-4E9B-A7C0-51D2B9E3F714}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist-installer
OutputBaseFilename=QuickPebble-Setup-{#MyAppVersion}-x64
SetupIconFile=..\src-tauri\icons\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "{#BuildDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; User data (history, bookmarks) lives in %APPDATA%\app.quickpebble.browser and is kept on purpose.
Type: filesandordirs; Name: "{app}"
