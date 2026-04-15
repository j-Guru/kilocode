@echo off
setlocal

set "SOURCE=%~dp0packages\opencode\dist\@kilocode\cli-windows-x64\bin\kilo.exe"
set "TARGET=d:\java\nvm4w\nodejs\kilo.exe"

if not exist "%SOURCE%" (
    echo [ERROR] Source binary not found: %SOURCE%
    echo Please run build process first.
    exit /b 1
)

echo [INFO] Copying newly built kilo.exe to installation bin folder...
copy /y "%SOURCE%" "%TARGET%"

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Kilo CLI updated in node bin folder.
    
    echo [INFO] Updating binaries inside node_modules to ensure shims use new version...
    
    set "NM_ROOT=d:\java\nvm4w\nodejs\node_modules"
    
    if exist "%%NM_ROOT%%\@kilocode\cli\node_modules\@kilocode\cli-windows-x64\bin\kilo.exe" (
        copy /y "%SOURCE%" "%%NM_ROOT%%\@kilocode\cli\node_modules\@kilocode\cli-windows-x64\bin\kilo.exe"
    )
    
    if exist "%%NM_ROOT%%\@kilocode\cli\node_modules\@kilocode\cli-windows-x64-baseline\bin\kilo.exe" (
        copy /y "%SOURCE%" "%%NM_ROOT%%\@kilocode\cli\node_modules\@kilocode\cli-windows-x64-baseline\bin\kilo.exe"
    )

    if exist "%%NM_ROOT%%\@kilocode\.cli-5ARfqZvX\node_modules\@kilocode\cli-windows-x64\bin\kilo.exe" (
        copy /y "%SOURCE%" "%%NM_ROOT%%\@kilocode\.cli-5ARfqZvX\node_modules\@kilocode\cli-windows-x64\bin\kilo.exe"
    )

    echo [SUCCESS] All installation binaries updated!
) else (
    echo [ERROR] Failed to copy kilo.exe. Make sure it's not running.
    exit /b %ERRORLEVEL%
)

endlocal
