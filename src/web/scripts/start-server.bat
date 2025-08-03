@echo off
REM param: %1 - 7DTD server path
REM param: %2 - CONFIG_FILE

set "SERVER_DIR=%~1"
set "CONFIG_FILE=%~2"

for /f %%i in ("%date:~0,10%_%time:~0,8%") do set TS=%%i
set TS=%TS::=_% & set TS=%TS:/=-% & set TS=%TS: =0%

start "" "%SERVER_DIR%\7DaysToDieServer.exe" -logfile "%SERVER_DIR%\Logs\output_log_%TS%.txt" -quit -batchmode -nographics "-configfile=%CONFIG_FILE%" -dedicated
