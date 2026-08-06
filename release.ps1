# Bumps the version everywhere, builds the installer, and refreshes latest.json.
# Usage: .\release.ps1 0.2.0 "What changed"
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [string]$Notes = ""
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$repo = 'https://github.com/duyalan04/codex-model-switcher'

function Set-FileText([string]$Path, [string]$Pattern, [string]$Replacement) {
    $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
    $updated = [regex]::Replace($text, $Pattern, $Replacement, 1)
    if ($updated -eq $text) { throw "Version pattern not found in $Path" }
    Set-Content -NoNewline -Encoding UTF8 -LiteralPath $Path -Value $updated
}

Set-FileText 'src-tauri\Cargo.toml'      '(?m)^version = "\d+\.\d+\.\d+"'   "version = `"$Version`""
Set-FileText 'src-tauri\tauri.conf.json' '"version": "\d+\.\d+\.\d+"'      "`"version`": `"$Version`""
Set-FileText 'package.json'              '"version": "\d+\.\d+\.\d+"'      "`"version`": `"$Version`""

$installer = "codex-model-switcher_${Version}_x64-setup.exe"
[ordered]@{
    version = $Version
    url     = "$repo/releases/latest/download/$installer"
    notes   = $Notes
} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath 'latest.json'

# NSIS only: the WiX/MSI toolchain fails on this machine and the updater uses the NSIS installer.
npm run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'Build failed (close the running app first).' }

Write-Host ""
Write-Host "Built v$Version. Upload these two files to a new GitHub release tagged v$Version:" -ForegroundColor Green
Write-Host "  src-tauri\target\release\bundle\nsis\$installer"
Write-Host "  latest.json"
