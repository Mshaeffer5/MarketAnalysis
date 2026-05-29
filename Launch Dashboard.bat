@echo off
setlocal EnableExtensions
title Atlas Market Dashboard

REM ============================================================
REM  This folder's path contains spaces, parentheses and an "&"
REM  and lives in OneDrive - all of which break npm / vite on
REM  Windows. So we mirror the project to a clean local folder
REM  and run it from there. Edits you (or Claude Code) make to
REM  the files in THIS OneDrive folder are picked up on the next
REM  launch, because we re-sync every time.
REM ============================================================

set "SRC=%~dp0"
set "WORKDIR=%LOCALAPPDATA%\AtlasMarketDashboard"

echo ============================================
echo   Atlas Market Dashboard - Launcher
echo ============================================
echo.

REM --- Check that Node.js / npm is installed ---
where npm >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js was not found on this computer.
  echo     Install the LTS version from https://nodejs.org
  echo     then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo Syncing project to a fast local folder...
echo   %WORKDIR%
echo.
robocopy "%SRC%." "%WORKDIR%" /MIR /XD node_modules dist .git .vercel /XF "Launch Dashboard.bat" /NFL /NDL /NJH /NJS /NP /R:1 /W:1 >nul
if errorlevel 8 (
  echo [X] Could not copy the project files to the local folder.
  echo.
  pause
  exit /b 1
)

cd /d "%WORKDIR%"

REM --- Install dependencies on first run (in the clean folder) ---
if not exist "node_modules" (
  echo First run: installing dependencies. This can take a couple of minutes...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [X] npm install failed. See the messages above.
    pause
    exit /b 1
  )
  echo.
)

echo Starting the dashboard...
echo Your browser will open automatically. To stop the app, close this window
echo or press Ctrl+C.
echo.

REM --- Open the browser after a short delay (server needs a moment) ---
start "" /b cmd /c "ping -n 5 127.0.0.1 >nul & start http://localhost:5173"

REM --- Start the dev server (keeps running in this window) ---
call npm run dev

echo.
echo The dashboard server has stopped.
pause
endlocal
