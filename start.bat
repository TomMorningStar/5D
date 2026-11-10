@echo off
cd /d "%~dp0"
if exist .env goto envok
copy .env.example .env >nul
echo The .env file was created. Open it, change the passwords, then run this file again.
pause
exit /b
:envok
if not exist server\node_modules call npm run setup
if not exist client\dist call npm run build
echo Starting... open http://localhost:3000
start "" http://localhost:3000
call npm start
pause
