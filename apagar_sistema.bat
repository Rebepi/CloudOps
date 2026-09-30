@echo off
setlocal
cd /d "%~dp0"
echo Deteniendo los contenedores de CloudOps, conservando sus datos...
docker compose stop
exit /b %errorlevel%
