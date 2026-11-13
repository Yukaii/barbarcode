# Installs the barbarcode command (a single self-contained executable, no Node.js needed).
#
#   irm https://barbarcode.yukai.dev/install.ps1 | iex
#
# Options (environment variables):
#   BARBARCODE_VERSION       version to install, e.g. 0.2.0 (default: latest)
#   BARBARCODE_INSTALL_DIR   where to put it (default: %LOCALAPPDATA%\barbarcode\bin)
#   BARBARCODE_DOWNLOAD_URL  base URL to download release assets from (for mirrors and testing)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes downloads much slower on PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = 'Yukaii/barbarcode'
$Version = if ($env:BARBARCODE_VERSION) { $env:BARBARCODE_VERSION } else { 'latest' }
$InstallDir = if ($env:BARBARCODE_INSTALL_DIR) { $env:BARBARCODE_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'barbarcode\bin' }

try {
  $osArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
} catch {
  $osArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
}
$Arch = if ($osArch -match 'Arm64') { 'arm64' } else { 'x64' }

$Asset = "barbarcode-windows-$Arch.zip"
$Base = if ($env:BARBARCODE_DOWNLOAD_URL) { $env:BARBARCODE_DOWNLOAD_URL }
        elseif ($Version -eq 'latest') { "https://github.com/$Repo/releases/latest/download" }
        else { "https://github.com/$Repo/releases/download/v$($Version.TrimStart('v'))" }

$Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("barbarcode-" + [System.Guid]::NewGuid())
New-Item -ItemType Directory -Path $Temp | Out-Null
try {
  Write-Host "Downloading $Asset..."
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile (Join-Path $Temp $Asset)
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS" -OutFile (Join-Path $Temp 'SHA256SUMS')

  $line = Get-Content (Join-Path $Temp 'SHA256SUMS') | Where-Object { $_ -match "\s$([regex]::Escape($Asset))$" } | Select-Object -First 1
  if (-not $line) { throw "No checksum listed for $Asset" }
  $expected = ($line -split '\s+')[0]
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $Temp $Asset)).Hash
  if ($actual -ne $expected) { throw "Checksum mismatch for $Asset; not installing" }

  Expand-Archive -Path (Join-Path $Temp $Asset) -DestinationPath $Temp -Force
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  $Exe = Join-Path $InstallDir 'barbarcode.exe'
  Move-Item -Path (Join-Path $Temp 'barbarcode.exe') -Destination $Exe -Force
} finally {
  Remove-Item -Recurse -Force $Temp -ErrorAction SilentlyContinue
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($userPath -split ';') -contains $InstallDir)) {
  $newPath = if ($userPath) { "$userPath;$InstallDir" } else { $InstallDir }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  $env:Path = "$env:Path;$InstallDir"
  Write-Host "Added $InstallDir to your PATH (new terminals pick it up automatically)."
}

Write-Host "Installed barbarcode $(& $Exe --version) to $Exe"
Write-Host 'Run it with: barbarcode'
