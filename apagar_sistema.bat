@echo off
setlocal
cd /d "%~dp0"
for %%p in (27902 27903) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr LISTENING') do taskkill /f /t /pid %%a >nul 2>&1
)
docker compose stop postgres
echo Servicios locales detenidos. El volumen de PostgreSQL se conserva.
exit /b 0
