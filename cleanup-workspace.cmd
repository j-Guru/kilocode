@echo off
setlocal

cd /d "%~dp0"

echo Cleaning generated workspace artifacts...
echo.

rem Remove staged generated artifacts from the index without touching source files.
git rm -r --cached -f --ignore-unmatch -- ^
  "packages/kilo-jetbrains/.gradle" ^
  "packages/kilo-jetbrains/.intellijPlatform" ^
  "packages/kilo-jetbrains/build" ^
  "packages/kilo-jetbrains/backend/build" ^
  "packages/kilo-jetbrains/build-tasks/.gradle" ^
  "packages/kilo-jetbrains/build-tasks/build" ^
  "packages/kilo-jetbrains/frontend/build" ^
  "packages/kilo-jetbrains/shared/build" ^
  "packages/opencode/.18a7b3bdefff959e-00000000.bun-build" ^
  "packages/opencode/src/provider/models-snapshot.d.ts" ^
  "packages/opencode/src/provider/models-snapshot.js" ^
  "packages/sdk/js/tsconfig.tsbuildinfo" ^
  ".opencode/package.json" ^
  ".opencode/bun.lock" >nul 2>&1

call :rm_dir "packages\kilo-jetbrains\.gradle"
call :rm_dir "packages\kilo-jetbrains\.intellijPlatform"
call :rm_dir "packages\kilo-jetbrains\build"
call :rm_dir "packages\kilo-jetbrains\backend\build"
call :rm_dir "packages\kilo-jetbrains\build-tasks\.gradle"
call :rm_dir "packages\kilo-jetbrains\build-tasks\build"
call :rm_dir "packages\kilo-jetbrains\frontend\build"
call :rm_dir "packages\kilo-jetbrains\shared\build"
call :rm_file "packages\opencode\.18a7b3bdefff959e-00000000.bun-build"
call :rm_file "packages\opencode\src\provider\models-snapshot.d.ts"
call :rm_file "packages\opencode\src\provider\models-snapshot.js"
call :rm_file "packages\sdk\js\tsconfig.tsbuildinfo"
call :rm_file ".opencode\package.json"
call :rm_file ".opencode\bun.lock"

echo.
echo Cleanup complete.
echo Not included on purpose:
echo   - npm uninstall -g @kilocode/cli
echo   - git reset --hard / git clean -fdx
echo   - packages\kilo-vscode\bin, dist, out, *.vsix cleanup, because current status is already clean there
exit /b 0

:rm_dir
if exist "%~1" (
  echo Removing %~1
  rmdir /s /q "%~1"
) else (
  echo Skipping %~1
)
exit /b 0

:rm_file
if exist "%~1" (
  echo Removing %~1
  del /f /q "%~1"
) else (
  echo Skipping %~1
)
exit /b 0
