[Code]
var

  ConfigPage: TWizardPage;
  ConfigPageID: Integer;

  WebPortInput: TEdit;

procedure CreateConfigPage;
var
  REG_WebPort: String;
  _Top: Integer;
  _Left: Integer;

begin

  Log('CreateConfigPage');

  ConfigPage := CreateCustomPage(wpSelectComponents, ExpandConstant('{cm:ConfigPageTitle}'), ExpandConstant('{cm:ConfigPageDescription}'));
  ConfigPageID := ConfigPage.ID;
  Log('ConfigPageID: ' + IntToStr(ConfigPageID));

  _Top := 0;
  _Left := 0;

  CreateLabel(ConfigPage.Surface, ExpandConstant('{cm:WebPort}'), _Top, _Left);

  _Top := _Top + 20;

  RegQueryStringValue(HKLM, 'Software\7DTD-DS-P', 'WebPort', REG_WebPort);
  if REG_WebPort = '' then REG_WebPort := '26901';
  WebPortInput := CreateInputNumber(ConfigPage.Surface, REG_WebPort, _Top, _Left);

  _Top := _Top + 30;

end;

function ConfigCheck: Boolean;
begin

  Log('ConfigCheck');

  Result := True;

  if not PortIsValid(WebPortInput.Text, True) then
  begin

    Result := False;

  end
  else if (WebPortInput.Text = '') then
  begin

    MsgBox(ExpandConstant('{cm:WebPortEmpty}'), mbError, MB_OK);
    Result := False;

  end;

end;

function GetWebPort(Param: String): String;
begin
  Result := WebPortInput.Text;
end;
