@echo off
setlocal

set "SOURCE=%~dp0packages\opencode\dist\@kilocode\cli-windows-x64\bin\kilo.exe"
set "TARGET=C:\Users\Admin\AppData\Local\nvm\v24.14.1\node_modules\@kilocode\cli\node_modules\@kilocode\cli-windows-x64\bin\kilo.exe"

if not exist "%SOURCE%" (
    echo [ERROR] Source binary not found: %SOURCE%
    echo Please run build process first.
    exit /b 1
)

if not exist "%TARGET%" (
    echo [ERROR] Target binary not found: %TARGET%
    exit /b 1
)

echo [INFO] Copying newly built kilo.exe to installed CLI package...
copy /y "%SOURCE%" "%TARGET%"

if errorlevel 1 (
    echo [ERROR] Failed to copy kilo.exe. Make sure it's not running.
    exit /b %ERRORLEVEL%
)

echo [SUCCESS] Kilo CLI updated: %TARGET%

endlocal
