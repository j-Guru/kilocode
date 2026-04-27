@echo off
setlocal enabledelayedexpansion

:: Resolve desktop path from environment
if defined USERPROFILE (
    set "DESKTOP=%USERPROFILE%\Desktop"
) else if defined HOMEDRIVE (
    set "DESKTOP=%HOMEDRIVE%%HOMEPATH%\Desktop"
) else (
    echo ERROR: Cannot determine desktop path. Neither USERPROFILE nor HOMEDRIVE is set.
    exit /b 1
)

:: Locate the VSIX directory relative to this script
set "VSIX_DIR=%~dp0packages\kilo-vscode"

if not exist "%VSIX_DIR%" (
    echo ERROR: VSIX directory not found: %VSIX_DIR%
    exit /b 1
)

:: Find the newest .vsix file
set "NEWEST="
set "NEWEST_TIME=0"

for /f "delims=" %%F in ('dir /b /o-d "%VSIX_DIR%\*.vsix" 2^>nul') do (
    if not defined NEWEST set "NEWEST=%%F"
)

if not defined NEWEST (
    echo ERROR: No .vsix file found in %VSIX_DIR%
    exit /b 1
)

set "SRC=%VSIX_DIR%\%NEWEST%"
set "DST=%DESKTOP%\%NEWEST%"

echo Source : %SRC%
echo Desktop: %DST%

copy /y "%SRC%" "%DST%" >nul
if errorlevel 1 (
    echo ERROR: Failed to copy %NEWEST% to desktop.
    exit /b 1
)

echo.
echo OK  %NEWEST%  ^>^>  %DESKTOP%
endlocal
