@echo off
setlocal

:: Define the expected source binary path based on Kilo Code's build script output
set "SOURCE=%~dp0packages\opencode\dist\@kilocode\cli-windows-x64\bin\kilo.exe"

:: Define the standard Kilo installation directory
set "TARGET_DIR=%USERPROFILE%\.kilo\bin"
set "TARGET=%TARGET_DIR%\kcv.exe"

:: Check if the source binary exists
if not exist "%SOURCE%" (
    echo [ERROR] Built binary not found: %SOURCE%
    echo Please run the build process first:
    echo   bun install
    echo   bun run .\packages\opencode\script\build.ts --single
    exit /b 1
)

:: Create the target directory if it doesn't exist
if not exist "%TARGET_DIR%" (
    echo [INFO] Creating directory: %TARGET_DIR%
    mkdir "%TARGET_DIR%" 2>nul
    if errorlevel 1 (
        echo [ERROR] Failed to create directory: %TARGET_DIR%
        exit /b 1
    )
)

:: Copy the binary
echo [INFO] Copying newly built kilo.exe to %TARGET%...
copy /y "%SOURCE%" "%TARGET%"

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Kilo CLI installed successfully to: %TARGET%
    
    :: Add to PATH for current session
    set "PATH=%TARGET_DIR%;%PATH%"
    
    :: Check if already in user PATH
    reg query "HKCU\Environment" /v PATH | find /i "%TARGET_DIR%" >nul
    if %ERRORLEVEL% neq 0 (
        echo [INFO] Adding %TARGET_DIR% to user PATH...
        
        :: Need powershell to safely append to user PATH without expanding variables like %PATH%
        powershell -NoProfile -ExecutionPolicy Bypass -Command "$oldPath = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($oldPath -and !$oldPath.EndsWith(';')) { $newPath = $oldPath + ';%TARGET_DIR%' } else { $newPath = $oldPath + '%TARGET_DIR%' }; [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')"
        
        if %ERRORLEVEL% equ 0 (
             echo [SUCCESS] PATH updated permanently for your user.
             echo Please restart your terminal for the changes to take effect.
        ) else (
             echo [ERROR] Failed to update user PATH. You may need to add it manually.
        )
    ) else (
        echo [INFO] %TARGET_DIR% is already in your user PATH.
    )

    echo.
    echo You can now run your local build using the command: kcv
    echo The original official build will still be available as: kilo
) else (
    echo [ERROR] Failed to copy kilo.exe. Make sure it's not currently running.
    exit /b %ERRORLEVEL%
)

endlocal
