@echo off
setlocal enabledelayedexpansion

echo Deteniendo servicios de CloudOps...

rem 1. Liberar puertos locales de CloudOps
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":27901 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do taskkill /f /pid %%a >nul 2>&1

rem 2. Detener unicamente el tunel cloudflared correspondiente a CloudOps
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name = 'cloudflared.exe'\" | Where-Object { $_.CommandLine -like '*20e44a9f-c8fb-4b9c-bd00-4332c0ddf536*' -or $_.CommandLine -like '*eyJhIjoiYTY1YmRjOTgwYjEzMmM2MTI5NTAyMDk5OTU0ZGFjMTMiLCJ0IjoiMjBlNDRhOWYtYzhmYi00YjljLWJkMDAtNDMzMmMwZGRmNTM2*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo CloudOps detenido correctamente.
exit /b 0
