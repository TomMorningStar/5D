@echo off
rem Stops the ticket server (for example before updating the program).
powershell -NoProfile -Command "$port=3000; $l=Select-String -Path '%~dp0.env' -Pattern '^PORT=(\d+)' -ErrorAction SilentlyContinue; if($l){$port=[int]$l.Matches[0].Groups[1].Value}; $c=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if($c){Stop-Process -Id $c.OwningProcess -Force; 'Server stopped'}else{'Server is not running'}"
pause
