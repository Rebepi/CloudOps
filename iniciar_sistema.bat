@echo off
setlocal enabledelayedexpansion
title CloudOps - Plataforma de Gestion Cloud y DevSecOps
color 0B
cls

echo =========================================================================
echo             CLOUDOPS - GESTION CLOUD, DEVSECOPS Y REDES VPC
echo =========================================================================
echo.

set "CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiYTY1YmRjOTgwYjEzMmM2MTI5NTAyMDk5OTU0ZGFjMTMiLCJ0IjoiMjBlNDRhOWYtYzhmYi00YjljLWJkMDAtNDMzMmMwZGRmNTM2IiwicyI6Ik9HRTNZemd4TmpVdE1UWmpZUzAwTlRBd0xUZzROall0T1RCak1qSXpZelF3TkRVeiJ9"

echo [1/2] Iniciando Frontend Vite de CloudOps (Puerto 27901)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":27901 " ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
start "CloudOps - Frontend Vite" /min cmd /c "cd /d "%~dp0" && npm run dev"

echo.
echo Esperando inicializacion del servicio local...
ping 127.0.0.1 -n 4 >nul

echo [2/2] Conectando Tunel Seguro Cloudflare con tu Dominio...
echo.
echo =========================================================================
echo   SISTEMA ACTIVO Y CONECTADO:
echo   - Local Frontend: http://localhost:27901
echo   - Tunel Remoto:   https://cloudops.rebepi.com
echo =========================================================================
echo.

start "CloudOps - Cloudflare Tunnel" /min cmd /c "cloudflared tunnel run --protocol http2 --token %CLOUDFLARE_TUNNEL_TOKEN%"

exit /b 0
