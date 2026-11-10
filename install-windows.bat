@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Установка: запускается один раз ===
where node >nul 2>&1
if errorlevel 1 (
  echo Не найден Node.js. Установите его с https://nodejs.org ^(версия LTS^) и запустите этот файл снова.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Сейчас откроется файл .env. Поменяйте пароли ADMIN_PASSWORD и OPERATOR_PASSWORD, сохраните и закройте.
  start /wait notepad .env
)
call npm run setup
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart\install-windows.ps1" -Root "%~dp0."
if errorlevel 1 goto fail
echo.
echo Готово. Ярлык «Номерки» создан на рабочем столе и в автозагрузке:
echo после включения ПК программа запускается сама.
echo Запускаю сейчас...
wscript "%~dp0autostart\launch.vbs"
exit /b 0
:fail
echo Ошибка установки. Скопируйте текст выше и покажите разработчику.
pause
exit /b 1
