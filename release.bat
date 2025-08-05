@echo off

cd /d src\web

IF EXIST public\saves (
    rmdir /s /q public\saves
)

call npm install
call npm run setup

pause