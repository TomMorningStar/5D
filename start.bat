@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env >nul
  echo Создан файл .env - откройте его и поменяйте пароли, затем запустите снова.
  pause
  exit /b
)
if not exist server\node_modules call npm run setup
if not exist client\dist call npm run build
echo Запуск... открой http://localhost:3000
start "" http://localhost:3000
call npm start
pause
