@echo off
setlocal
cd /d "%~dp0..\backend"
node scripts\cloudops-power.mjs stop
exit /b %errorlevel%
