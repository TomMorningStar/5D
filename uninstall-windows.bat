@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart\install-windows.ps1" -Root "%~dp0." -Remove
echo Shortcuts removed. The data folder was not touched.
pause
