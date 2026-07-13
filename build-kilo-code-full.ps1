[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Build {
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Command,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    Write-Host "`n==> Building $Name"
    Push-Location $Path
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Name build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

if ($env:OS -ne "Windows_NT") {
    throw "This script builds Windows x64 artifacts and must run on Windows."
}

if ([System.Environment]::Is64BitProcess -ne $true -or $env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
    throw "This script requires a 64-bit x64 PowerShell and Bun process."
}

if ($null -eq (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw "Bun was not found on PATH. Install Bun, then run this script again."
}

$root = $PSScriptRoot
$out = Join-Path $root "dist"
$cli = Join-Path $root "packages\opencode"
$vscode = Join-Path $root "packages\kilo-vscode"
$jetbrains = Join-Path $root "packages\kilo-jetbrains"

Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $out | Out-Null

Invoke-Build -Name "Kilo CLI" -Path $cli -Command "bun" -Arguments @("script/build.ts", "--single")

$binary = Join-Path $cli "dist\@kilocode\cli-windows-x64\bin\kilo.exe"
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "CLI artifact was not produced at $binary."
}
Copy-Item -LiteralPath $binary -Destination (Join-Path $out "kilo-win32-x64.exe")

Invoke-Build -Name "Kilo VS Code extension" -Path $vscode -Command "bun" -Arguments @("run", "package")
Invoke-Build -Name "Kilo VSIX" -Path $vscode -Command "bun" -Arguments @(
    "x",
    "vsce",
    "package",
    "--no-dependencies",
    "--skip-license",
    "--target",
    "win32-x64",
    "-o",
    (Join-Path $out "kilo-code-win32-x64.vsix")
)

$vsix = Join-Path $out "kilo-code-win32-x64.vsix"
if (-not (Test-Path -LiteralPath $vsix -PathType Leaf)) {
    throw "VSIX artifact was not produced at $vsix."
}

$info = Get-Content (Join-Path $jetbrains "package.json") -Raw | ConvertFrom-Json
Invoke-Build -Name "Kilo JetBrains plugin" -Path $jetbrains -Command ".\\gradlew.bat" -Arguments @(
    "buildPlugin",
    "-Pproduction=true",
    "-Pkilo.version=$($info.version)"
)

$archive = Join-Path $jetbrains "build\\distributions\\kilo.jetbrains-$($info.version).zip"
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
    throw "JetBrains artifact was not produced at $archive."
}
Copy-Item -LiteralPath $archive -Destination (Join-Path $out "kilo-jetbrains.zip")

Write-Host "`nBuild complete. Artifacts:"
Get-ChildItem -LiteralPath $out -File | Select-Object Name, Length | Format-Table -AutoSize
