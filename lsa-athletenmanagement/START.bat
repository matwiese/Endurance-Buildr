@echo off
setlocal EnableExtensions EnableDelayedExpansion
title LSA Athletenmanagement
cd /d "%~dp0"

echo.
echo  ==============================================
echo    LSA Athletenmanagement - Prototyp
echo  ==============================================
echo.

set "NODE="
if exist "%~dp0runtime\node\node.exe" set "NODE=%~dp0runtime\node\node.exe"
if not defined NODE (
  where node >nul 2>&1
  if not errorlevel 1 (
    for /f "delims=" %%i in ('where node') do if not defined NODE set "NODE=%%i"
  )
)
if defined NODE (
  "!NODE!" -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a>22||(a===22&&b>=13))?0:1)" >nul 2>&1
  if errorlevel 1 (
    echo  Das gefundene Node.js ist zu alt - benoetigt wird Version 22.13 oder neuer.
    set "NODE="
  )
)
if defined NODE goto :run

echo  Node.js ^(die Laufzeitumgebung^) wurde nicht gefunden.
echo.
echo  Dieses Programm kann eine portable Version ^(ca. 30 MB^) von nodejs.org laden.
echo  Sie wird nur in den Programmordner entpackt, es wird nichts im System installiert.
echo  Die Pruefsumme der Datei wird gegen nodejs.org geprueft.
echo.
choice /c JN /n /m "  Jetzt herunterladen? [J]a / [N]ein: "
if errorlevel 2 goto :nonode
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-node.ps1"
if not exist "%~dp0runtime\node\node.exe" goto :nonode
set "NODE=%~dp0runtime\node\node.exe"

:run
echo  Starte ...
echo.
"!NODE!" --disable-warning=ExperimentalWarning server\index.js --open
if errorlevel 1 (
  echo.
  echo  Das Programm wurde mit einem Fehler beendet. Bitte die Meldung oben ansehen.
  pause
)
goto :eof

:nonode
echo.
echo  Ohne Node.js kann das Programm nicht starten.
echo  Manuell installieren: https://nodejs.org ^(LTS-Version 22 oder neuer^), danach START.bat erneut starten.
echo.
pause
