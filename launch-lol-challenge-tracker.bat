@echo off
setlocal ENABLEDELAYEDEXPANSION
REM Launcher for LoL Challenge Tracker – prefers installed EXE, falls back to dev mode

REM Jump to repo root (this .bat lives in the repo root)
cd /d "%~dp0"

REM Preferred: open the installed app if it exists
set "APP_EXE=%LocalAppData%\Programs\LoL Challenge Tracker\LoL Challenge Tracker.exe"
if exist "%APP_EXE%" (
  echo Launching installed LoL Challenge Tracker...
  start "" "%APP_EXE%"
  exit /b 0
)

REM Fallback: run the project in dev mode
echo Installed app not found. Starting development mode...
cd /d "%~dp0lol-challenge-tracker"

REM Use the project’s Node if you normally run via npm
call npm run dev

endlocal