[Code]
var

  ConfigPage: TWizardPage;
  ConfigPageID: Integer;

  WebPortInput: TEdit;
  GameServerPortInput: TEdit;
  GameServerTelnetPortInput: TEdit;
  GameServerTelnetPasswordInput: TEdit;

procedure CreateConfigPage;
var
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

  WebPortInput := CreateInputNumber(ConfigPage.Surface, '26902', _Top, _Left);

  _Top := _Top + 30;

  CreateLabel(ConfigPage.Surface, ExpandConstant('{cm:GameServerPort}'), _Top, _Left);

  _Top := _Top + 20;

  GameServerPortInput := CreateInputNumber(ConfigPage.Surface, '26900', _Top, _Left);

  _Top := _Top + 30;

  CreateLabel(ConfigPage.Surface, ExpandConstant('{cm:GameServerTelnetPort}'), _Top, _Left);

  _Top := _Top + 20;
  
  GameServerTelnetPortInput := CreateInputNumber(ConfigPage.Surface, '26901', _Top, _Left);

  _Top := _Top + 30;

  CreateLabel(ConfigPage.Surface, ExpandConstant('{cm:GameServerTelnetPassword}'), _Top, _Left);

  _Top := _Top + 20;

  GameServerTelnetPasswordInput := CreateInputText(ConfigPage.Surface, '', _Top, _Left);

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

  end
  else if not PortIsValid(GameServerPortInput.Text, True) then
  begin

    MsgBox(ExpandConstant('{cm:GameServerPortInvalid}'), mbError, MB_OK);
    Result := False;

  end
  else if (GameServerPortInput.Text = '') then
  begin

    MsgBox(ExpandConstant('{cm:GameServerPortEmpty}'), mbError, MB_OK);
    Result := False;

  end
  else if not PortIsValid(GameServerTelnetPortInput.Text, True) then
  begin

    MsgBox(ExpandConstant('{cm:GameServerTelnetPortInvalid}'), mbError, MB_OK);
    Result := False;

  end
  else if (GameServerTelnetPortInput.Text = '') then
  begin

    MsgBox(ExpandConstant('{cm:GameServerTelnetPortEmpty}'), mbError, MB_OK);
    Result := False;

  end
  else if (GameServerTelnetPasswordInput.Text = '') then
  begin

    MsgBox(ExpandConstant('{cm:GameServerTelnetPasswordEmpty}'), mbError, MB_OK);
    Result := False;

  end;

end;