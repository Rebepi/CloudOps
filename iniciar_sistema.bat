@echo off
setlocal
cd /d "%~dp0"
echo Iniciando PostgreSQL local...
docker compose up -d postgres || exit /b 1
echo Aplicando migraciones locales...
cd backend
call npm run migrate || exit /b 1
start "CloudOps API local" /min /D "%~dp0backend" cmd /c "npm run dev"
cd ..\frontend
start "CloudOps frontend local" /min /D "%~dp0frontend" cmd /c "npm run dev"
echo CloudOps disponible en http://127.0.0.1:27903
echo AWS se consulta con el perfil cloudops-root. No se despliega infraestructura.
exit /b 0
