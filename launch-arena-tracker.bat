@echo off
echo Starting League Arena Tracker...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Navigate to arena-tracker directory
cd /d "%~dp0arena-tracker"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Start the development server
echo Starting development server...
npm run dev

REM Keep window open if there's an error
if %errorlevel% neq 0 (
    echo.
    echo Error: Failed to start the application
    pause
)