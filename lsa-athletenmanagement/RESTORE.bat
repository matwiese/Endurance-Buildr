@echo off
setlocal EnableExtensions EnableDelayedExpansion
title LSA Athletenmanagement - Wiederherstellung
cd /d "%~dp0"

set "NODE="
if exist "%~dp0runtime\node\node.exe" set "NODE=%~dp0runtime\node\node.exe"
if not defined NODE (
  where node >nul 2>&1
  if not errorlevel 1 (
    for /f "delims=" %%i in ('where node') do if not defined NODE set "NODE=%%i"
  )
)
if not defined NODE (
  echo.
  echo  Node.js wurde nicht gefunden. Bitte zuerst START.bat einmal ausfuehren ^(laedt Node.js bei Bedarf^).
  echo.
  pause
  goto :eof
)
"!NODE!" --disable-warning=ExperimentalWarning tools\restore.mjs %*
echo.
pause
