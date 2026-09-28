@echo off
setlocal

cd /d "%~dp0"
if errorlevel 1 goto folder_error

node --version >nul 2>&1
if errorlevel 1 goto node_error

for /f "tokens=1,2 delims=." %%A in ('node -p "process.versions.node"') do (
    set "NODE_MAJOR=%%A"
    set "NODE_MINOR=%%B"
)
if "%NODE_MAJOR%"=="20" if %NODE_MINOR% LSS 19 goto node_version_error
if "%NODE_MAJOR%"=="21" goto node_version_error
if "%NODE_MAJOR%"=="22" if %NODE_MINOR% LSS 12 goto node_version_error
if %NODE_MAJOR% LSS 20 goto node_version_error

call npm --version >nul 2>&1
if errorlevel 1 goto npm_error

if exist "node_modules\vite\bin\vite.js" goto start_server
echo Installing project dependencies...
call npm install
if errorlevel 1 goto install_error

:start_server
echo Starting the Skyshard development server...
call npm run dev -- --open
if errorlevel 1 goto server_error
endlocal
exit /b 0

:folder_error
echo [ERROR] Could not change to the project folder.
pause
exit /b 1

:node_error
echo [ERROR] Node.js was not found in PATH.
echo Install Node.js 20.19+ or 22.12+ and try again.
pause
exit /b 1

:node_version_error
echo [ERROR] Node.js 20.19+ or 22.12+ is required. Current version:
node --version
pause
exit /b 1

:npm_error
echo [ERROR] npm was not found in PATH. Check your Node.js installation.
pause
exit /b 1

:install_error
echo [ERROR] Dependency installation failed.
pause
exit /b 1

:server_error
echo [ERROR] The development server exited with an error or was interrupted.
pause
exit /b 1
