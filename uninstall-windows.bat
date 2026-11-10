@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart\install-windows.ps1" -Root "%~dp0." -Remove
echo Ярлыки удалены. Данные в папке data не тронуты.
pause
