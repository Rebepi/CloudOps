@echo off
setlocal
cd /d "%~dp0"
echo Iniciando CloudOps local: PostgreSQL, backend y frontend...
docker compose up -d --build
if errorlevel 1 (
  echo No se pudo iniciar. Verifica que Docker Desktop este activo.
  exit /b 1
)
echo Frontend: http://localhost:27901
echo OpenAPI: http://localhost:8000/docs
echo AWS real requiere configuracion explicita con compose.aws.yaml. El login aun es local mock.
echo FLOCI es opcional: docker compose --profile floci up -d floci
