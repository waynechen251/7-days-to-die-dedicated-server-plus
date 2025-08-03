@echo off
REM params:
REM   %1 - STEAMCMD.exe path
REM   %2 - 7DTD server install path
REM   %3 - version (optional, e.g., v2.0)

set "STEAMCMD=%~1"
set "SERVER_DIR=%~2"
set "VERSION=%~3"

if "%VERSION%"=="" (
    set "BETA_PARAM="
) else (
    set "BETA_PARAM=-beta %VERSION%"
)

"%STEAMCMD%" +login anonymous +force_install_dir "%SERVER_DIR%" +app_update 294420 %BETA_PARAM% validate +quit