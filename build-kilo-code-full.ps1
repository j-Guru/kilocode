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
        [string[]]$Arguments,
        [ValidateRange(0, 5)]
        [int]$Retries = 0
    )

    Write-Host "`n==> Building $Name"
    Push-Location $Path
    try {
        for ($attempt = 0; $attempt -le $Retries; $attempt++) {
            & $Command @Arguments
            if ($LASTEXITCODE -eq 0) {
                return
            }

            if ($attempt -eq $Retries) {
                throw "$Name build failed with exit code $LASTEXITCODE."
            }

            Write-Host "$Name build failed with exit code $LASTEXITCODE. Retrying in 5 seconds."
            Start-Sleep -Seconds 5
        }
    }
    finally {
        Pop-Location
    }
}

function Get-Sha256 {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $stream = [System.IO.File]::OpenRead($Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace("-", "")
    }
    finally {
        $sha.Dispose()
        $stream.Dispose()
    }
}

function Get-TrackedState {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $status = @(& git -C $Path status --porcelain=v1 --untracked-files=no)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect tracked files in $Path."
    }

    $diff = @(& git -C $Path diff --raw --no-ext-diff --no-renames HEAD --)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect tracked changes in $Path."
    }

    $text = ($status -join "`n") + "`n--DIFF--`n" + ($diff -join "`n")
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "")
    }
    finally {
        $sha.Dispose()
    }
}

function New-KiloArchive {
    param(
        [Parameter(Mandatory)]
        [string]$Source,
        [Parameter(Mandatory)]
        [string]$Destination
    )

    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $Source,
        $Destination,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )

    $archive = [System.IO.Compression.ZipFile]::Open($Destination, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        Get-ChildItem -LiteralPath $Source -Directory -Recurse | ForEach-Object {
            $path = [System.IO.Path]::GetRelativePath($Source, $_.FullName).Replace("\", "/") + "/"
            [void]$archive.CreateEntry($path)
        }
    }
    finally {
        $archive.Dispose()
    }

    $expected = @(
        Get-ChildItem -LiteralPath $Source -File -Recurse | ForEach-Object {
            [System.IO.Path]::GetRelativePath($Source, $_.FullName).Replace("\", "/")
        }
    )

    $archive = [System.IO.Compression.ZipFile]::OpenRead($Destination)
    try {
        $actual = @(
            $archive.Entries | Where-Object { -not $_.FullName.EndsWith("/") } | ForEach-Object { $_.FullName }
        )
        $diff = @(Compare-Object -ReferenceObject $expected -DifferenceObject $actual)
        if ($diff.Count -ne 0) {
            throw "CLI archive contents do not match $Source."
        }

        $entry = $archive.GetEntry("kilo.exe")
        if ($null -eq $entry) {
            throw "CLI archive does not contain kilo.exe."
        }

        $stream = $entry.Open()
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $archiveHash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace("-", "")
        }
        finally {
            $sha.Dispose()
            $stream.Dispose()
        }

        $binaryHash = Get-Sha256 -Path (Join-Path $Source "kilo.exe")
        if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals($binaryHash, $archiveHash)) {
            throw "CLI archive executable does not match the built kilo.exe."
        }
    }
    finally {
        $archive.Dispose()
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
$stage = "$out.tmp"
$backup = "$out.previous"
$cli = Join-Path $root "packages\opencode"
$vscode = Join-Path $root "packages\kilo-vscode"
$jetbrains = Join-Path $root "packages\kilo-jetbrains"
$before = Get-TrackedState -Path $root

if (Test-Path -LiteralPath $backup) {
    if (Test-Path -LiteralPath $out) {
        Remove-Item -LiteralPath $backup -Recurse -Force
    }
    else {
        Move-Item -LiteralPath $backup -Destination $out
    }
}
if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage | Out-Null

try {
    Invoke-Build -Name "Dependencies" -Path $root -Command "bun" -Arguments @("install", "--frozen-lockfile")

@("bin", "dist", "out") | ForEach-Object {
    $path = Join-Path $vscode $_
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force
    }
}
Get-ChildItem -LiteralPath $vscode -Filter "*.vsix" -File | Remove-Item -Force

Invoke-Build -Name "Kilo CLI" -Path $cli -Command "bun" -Arguments @("script/build.ts", "--single", "--skip-install") -Retries 3

Add-Type -AssemblyName System.IO.Compression.FileSystem
$bundle = Join-Path $cli "dist\@kilocode\cli-windows-x64\bin"
$binary = Join-Path $bundle "kilo.exe"
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "CLI artifact was not produced at $binary."
}

$maps = @(Get-ChildItem -LiteralPath $bundle -Filter "*.map" -File -Recurse)
if ($maps.Count -gt 0) {
    Write-Host "Removing $($maps.Count) development source map(s) from the CLI archive."
    $maps | Remove-Item -Force
}

$cliArchive = Join-Path $stage "kilo-windows-x64.zip"
New-KiloArchive -Source $bundle -Destination $cliArchive

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
    (Join-Path $stage "kilo-code-win32-x64.vsix")
)

$vsix = Join-Path $stage "kilo-code-win32-x64.vsix"
if (-not (Test-Path -LiteralPath $vsix -PathType Leaf)) {
    throw "VSIX artifact was not produced at $vsix."
}

$standalone = Get-Sha256 -Path $binary
$package = [System.IO.Compression.ZipFile]::OpenRead($vsix)
try {
    $bundled = $package.GetEntry("extension/bin/kilo.exe")
    if ($null -eq $bundled) {
        throw "The VSIX does not contain extension/bin/kilo.exe."
    }

    $stream = $bundled.Open()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bundledHash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace("-", "")
    }
    finally {
        $sha.Dispose()
        $stream.Dispose()
    }

    if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals($standalone, $bundledHash)) {
        throw "VSIX CLI mismatch: the bundled CLI does not match $binary."
    }
}
finally {
    $package.Dispose()
}

$properties = Join-Path $jetbrains "gradle.properties"
$entry = Get-Content -LiteralPath $properties | Where-Object {
    $_ -match "^\s*kilo\.jetbrains\.version\s*="
} | Select-Object -First 1
if ($null -eq $entry) {
    throw "kilo.jetbrains.version was not found in $properties."
}

$version = ($entry -split "=", 2)[1].Trim()
if ($version -notmatch "^\d+\.\d+\.\d+(-rc\.\d+)?$") {
    throw "Invalid JetBrains plugin version '$version' in $properties."
}

Invoke-Build -Name "Kilo JetBrains plugin" -Path $jetbrains -Command ".\\gradlew.bat" -Arguments @(
    "clean",
    "buildPlugin",
    "verifyPlugin",
    "-Pproduction=true"
)

$archive = Join-Path $jetbrains "build\\distributions\\kilo.jetbrains-$version.zip"
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
    throw "JetBrains artifact was not produced at $archive."
}

$outer = [System.IO.Compression.ZipFile]::OpenRead($archive)
try {
    $jarPath = "kilo.jetbrains/lib/kilo.jetbrains-$version.jar"
    $jar = $outer.GetEntry($jarPath)
    if ($null -eq $jar) {
        throw "JetBrains plugin JAR was not found at $jarPath in $archive."
    }

    $source = $jar.Open()
    $buffer = [System.IO.MemoryStream]::new()
    try {
        $source.CopyTo($buffer)
        $buffer.Position = 0
        $inner = [System.IO.Compression.ZipArchive]::new(
            $buffer,
            [System.IO.Compression.ZipArchiveMode]::Read,
            $true
        )
        try {
            $pluginXml = $inner.GetEntry("META-INF/plugin.xml")
            if ($null -eq $pluginXml) {
                throw "META-INF/plugin.xml was not found in $jarPath."
            }

            $reader = [System.IO.StreamReader]::new($pluginXml.Open())
            try {
                [xml]$metadata = $reader.ReadToEnd()
            }
            finally {
                $reader.Dispose()
            }

            $embedded = [string]$metadata.'idea-plugin'.version
            if ($embedded -ne $version) {
                throw "JetBrains artifact version mismatch: expected $version, embedded $embedded."
            }
        }
        finally {
            $inner.Dispose()
        }
    }
    finally {
        $source.Dispose()
        $buffer.Dispose()
    }
}
finally {
    $outer.Dispose()
}

Copy-Item -LiteralPath $archive -Destination (Join-Path $stage "kilo-jetbrains-$version.zip")

$after = Get-TrackedState -Path $root
if ($after -cne $before) {
    throw "The build modified tracked repository files. Review git status; artifacts were not published."
}

if (Test-Path -LiteralPath $out) {
    Move-Item -LiteralPath $out -Destination $backup
}
try {
    Move-Item -LiteralPath $stage -Destination $out
}
catch {
    if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $out)) {
        Move-Item -LiteralPath $backup -Destination $out
    }
    throw
}
if (Test-Path -LiteralPath $backup) {
    Remove-Item -LiteralPath $backup -Recurse -Force
}

Write-Host "`nBuild complete. Artifacts:"
Get-ChildItem -LiteralPath $out -File | Select-Object Name, Length | Format-Table -AutoSize
}
finally {
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
}
