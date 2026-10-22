@echo off
setlocal
set "PSCRIPT=%~dp0backend\scripts\cloudops-power.mjs"
set "PDIR=%~dp0backend"
if not exist "%PSCRIPT%" (
  set "PSCRIPT=%~dp0..\backend\scripts\cloudops-power.mjs"
  set "PDIR=%~dp0..\backend"
)
if not exist "%PSCRIPT%" (
  echo ERROR: no se encontro cloudops-power.mjs
  exit /b 1
)
pushd "%PDIR%"
node "%PSCRIPT%" start
set "RC=%errorlevel%"
popd
exit /b %RC%
