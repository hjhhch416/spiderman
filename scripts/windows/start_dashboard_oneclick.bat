@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_dashboard_oneclick.ps1"
if errorlevel 1 (
  echo.
  echo Dashboard start failed. Check the message above.
  pause
)
