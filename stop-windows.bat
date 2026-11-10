@echo off
chcp 65001 >nul
rem Останавливает сервер номерков (нужно, например, перед обновлением программы).
powershell -NoProfile -Command "$port=3000; $l=Select-String -Path '%~dp0.env' -Pattern '^PORT=(\d+)' -ErrorAction SilentlyContinue; if($l){$port=[int]$l.Matches[0].Groups[1].Value}; $c=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if($c){Stop-Process -Id $c.OwningProcess -Force; 'Сервер остановлен'}else{'Сервер не запущен'}"
pause
