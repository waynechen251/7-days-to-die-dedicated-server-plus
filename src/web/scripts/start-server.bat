@echo off
REM param: %1 - 7DTD server path

set "SERVER_DIR=%~1"

pushd "%SERVER_DIR%"
if not exist "Logs" mkdir Logs
for /f "tokens=* skip=20" %%f in ('dir Logs\output_log_*.txt /b /o-d') do del "Logs\%%f"
popd