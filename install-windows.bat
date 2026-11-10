@echo off
cd /d "%~dp0"
echo === Installation (run once) ===
where node >nul 2>&1
if errorlevel 1 goto nonode
if exist .env goto envok
copy .env.example .env >nul
echo Notepad will open with the .env file.
echo Change ADMIN_PASSWORD and OPERATOR_PASSWORD, then save and close Notepad.
start /wait notepad .env
:envok
call npm run setup
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart\install-windows.ps1" -Root "%~dp0."
if errorlevel 1 goto fail
echo.
echo Done. The shortcut "Nomerki" was created on the Desktop and in Startup.
echo The program will now start automatically every time the PC is turned on.
echo Starting it now...
wscript "%~dp0autostart\launch.vbs"
exit /b 0
:nonode
echo Node.js was not found.
echo Install it from https://nodejs.org (LTS version) and run this file again.
pause
exit /b 1
:fail
echo Installation failed. Copy the text above and send it to the developer.
pause
exit /b 1
