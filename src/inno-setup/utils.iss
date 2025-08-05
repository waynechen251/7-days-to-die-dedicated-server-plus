[Code]

// 檢查端口是否被佔用
function CheckPortsAvailability(const Ports: array of string): Boolean;
var
  I: Integer;
  Params: String;
  OccupiedPorts: String;
  ResultCode: Integer;
begin

  OccupiedPorts := '';
  Result := True;

  for I := Low(Ports) to High(Ports) do
  begin

    Params := 'netstat -aon | findstr /R /C:":' + Ports[I] + ' " | findstr /R /C:"^  TCP    [0-9\.\:]*:' + Ports[I] + ' " /C:"^  TCP    \[::\]:' + Ports[I] + ' " /C:"^ TCP 127.0.0.1:' + Ports[I] + ' "';
    Log('Params: cmd.exe ' + Params);
    ShellExec('runas', 'cmd.exe', '/C ' + Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if ResultCode = 0 then
    begin

      if OccupiedPorts <> '' then
        OccupiedPorts := OccupiedPorts + ', ';
      OccupiedPorts := OccupiedPorts + Ports[I];
      MsgBox(OccupiedPorts + ' ' + ExpandConstant('{cm:portIsUsed}'), mbError, MB_OK);
      Result := False;
      
    end;

  end;

end;

// 添加防火牆規則
procedure AddPortsInFirewall(const RuleName: string; const Ports: string);
var
  ResultCode: Integer;
begin

  // 刪除現有的防火牆規則
  Exec(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="' + RuleName + '"', ExpandConstant('{sys}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // 添加新的防火牆規則，包含所有端口
  Exec(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall add rule name="' + RuleName + '" dir=in protocol=tcp action=allow localport=' + Ports, ExpandConstant('{sys}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);

end;

// 輸入框只能輸入數字
procedure InputKeyPress_Number(Sender: TObject; var Key: Char);
begin

  Log('InputKeyPress_Number: Key=' + Key);

  if not (Key = '0') and 
    not (Key = '1') and 
    not (Key = '2') and 
    not (Key = '3') and 
    not (Key = '4') and 
    not (Key = '5') and 
    not (Key = '6') and 
    not (Key = '7') and 
    not (Key = '8') and 
    not (Key = '9') and 
    not (Key = #8) then // #8 is the backspace character
  begin

    Key := #0; // Disallow the key press

  end;

end;

// 輔助函數來創建標籤控件
function CreateLabel(_Parent: TWinControl; const _Caption: String; const _Top: Integer; const _Left: Integer): TLabel;
var
  _Label: TLabel;
begin

  _Label := TLabel.Create(WizardForm);
  _Label.Parent := _Parent;
  _Label.Top := _Top;
  _Label.Left := _Left;

  _Label.Caption := _Caption;

  Result := _Label;

end;

// 輔助函數來創建輸入文字控件
function CreateInputText(_Parent: TWinControl; const _defaultText: String; const _Top: Integer; const _Left: Integer): TEdit;
var
  _Input: TEdit;
begin

  _Input := TEdit.Create(WizardForm);
  _Input.Parent := _Parent;
  _Input.Top := _Top;
  _Input.Left := _Left;
  _Input.Width := 200;
  
  _Input.Text := _defaultText;

  Result := _Input;

end;

// 輔助函數來創建輸入數字控件
function CreateInputNumber(_Parent: TWinControl; const _defaultText: String; const _Top: Integer; const _Left: Integer): TEdit;
var
  _Input: TEdit;
begin

  _Input := TEdit.Create(WizardForm);
  _Input.Parent := _Parent;
  _Input.Top := _Top;
  _Input.Left := _Left;
  _Input.Width := 200;
  
  _Input.Text := _defaultText;
  _Input.onKeyPress := @InputKeyPress_Number;

  Result := _Input;

end;

// 輔助函數來創建輸入控件(密碼)
function CreatePasswordInput(_Parent: TWinControl; const _Top: Integer; const _Left: Integer): TPasswordEdit;
var
  _Input: TPasswordEdit;
begin

  _Input := TPasswordEdit.Create(WizardForm);
  _Input.Parent := _Parent;
  _Input.Top := _Top;
  _Input.Left := _Left;
  _Input.Width := 200;
  
  Result := _Input;

end;

// 輔助函數來創建單選按鈕控件
function CreateRadioButton(_Parent: TWinControl; const _Caption: String; const _Top: Integer; const _Left: Integer; _Checked: Boolean): TRadioButton;
var
  _RadioButton: TRadioButton;
begin

  _RadioButton := TRadioButton.Create(WizardForm);
  _RadioButton.Parent := _Parent;
  _RadioButton.Top := _Top;
  _RadioButton.Left := _Left;
  _RadioButton.Caption := _Caption;
  _RadioButton.Width := 200;
  _RadioButton.Checked := _Checked;

  Result := _RadioButton;

end;

// 輔助函數來創建下拉選單控件（禁止手動輸入）
function CreateComboBox(_Parent: TWinControl; const _Top: Integer; const _Left: Integer): TComboBox;
var
  _ComboBox: TComboBox;
  
begin

  _ComboBox := TComboBox.Create(WizardForm);
  _ComboBox.Parent := _Parent;
  _ComboBox.Top := _Top;
  _ComboBox.Left := _Left;
  _ComboBox.Width := 200;
  _ComboBox.Style := csDropDownList;
  Result := _ComboBox;

end;

// 檢查是否為數字
function IsNumeric(const S: String): Boolean;
var
  I: Integer;

begin

  Result := True;
  for I := 1 to Length(S) do
  begin
    if not (S[I] in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) then

    begin

      Result := False;
      Break;

    end;

  end;

end;

function Ipv4IsValid(const Ip: String): Boolean;
var
  ResultCode: Integer;
  RegEx: String;
  PSCommand: String;

begin

  Log('Ipv4IsValid: Ip=' + Ip);

  Result := True;

  // 檢查是否為空
  if Ip = '' then
  begin

    MsgBox(ExpandConstant('{cm:IpEmpty}'), mbError, MB_OK);
    Result := False;
    Exit;

  end
  else
  begin

    RegEx := '^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$';
    PSCommand := '-NoProfile -ExecutionPolicy Bypass -Command "if (''' + Ip + ''' -match ''' + RegEx + ''') { exit 0 } else { exit 1 }"';

    ShellExec('runas', 'powershell', PSCommand, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if ResultCode <> 0 then
    begin

      MsgBox(ExpandConstant('{cm:IpInvalid}'), mbError, MB_OK);
      Result := False;
      Exit;

    end;

  end;

end;

function PortIsValid(const Port: String; IsCheckUsed: Boolean): Boolean;
var
  PortNum: Integer;

begin

  Log('PortIsValid: Port=' + Port);

  // 檢查是否為空
  if Port = '' then
  begin

    MsgBox(ExpandConstant('{cm:PortEmpty}'), mbError, MB_OK);
    Result := False;
    Exit;

  end;

  // 檢查是否為數字
  if not IsNumeric(Port) then
  begin

    MsgBox(ExpandConstant('{cm:PortInvalid}'), mbError, MB_OK);
    Result := False;
    Exit;

  end;

  // 檢查端口範圍
  PortNum := StrToInt(Port);
  if (PortNum < 1) or (PortNum > 65535) then
  begin

    MsgBox(ExpandConstant('{cm:PortRangeInvalid}'), mbError, MB_OK);
    Result := False;
    Exit;

  end;

  // 檢查端口是否被佔用(如果 IsCheckUsed 為 True, 這代表要檢查本地端口是否被佔用)
  if IsCheckUsed and not CheckPortsAvailability([Port]) then
  begin

    Result := False;
    Exit;

  end;

  // 全部檢查通過，返回 True
  Result := True;

end;