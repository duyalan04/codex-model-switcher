# Bumps the version, builds the installer, commits, tags, and publishes the
# GitHub release with both assets attached.
# Usage: .\release.ps1 0.3.0 "What changed"
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [string]$Notes = "",
    # Stops after building, leaving the commit, tag, and release to you.
    [switch]$NoPublish
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$repo = 'https://github.com/duyalan04/codex-model-switcher'

# Writes UTF-8 without a BOM; a BOM breaks JSON parsers such as PostCSS config loading.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-TextFile([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $Path), $Content, $Utf8NoBom)
}

function Set-FileText([string]$Path, [string]$Pattern, [string]$Replacement) {
    $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
    $updated = [regex]::Replace($text, $Pattern, $Replacement, 1)
    if ($updated -eq $text) { throw "Version pattern not found in $Path" }
    Write-TextFile $Path $updated
}

Set-FileText 'src-tauri\Cargo.toml'      '(?m)^version = "\d+\.\d+\.\d+"'   "version = `"$Version`""
Set-FileText 'src-tauri\tauri.conf.json' '"version": "\d+\.\d+\.\d+"'      "`"version`": `"$Version`""
Set-FileText 'package.json'              '"version": "\d+\.\d+\.\d+"'      "`"version`": `"$Version`""

$installer = "codex-model-switcher_${Version}_x64-setup.exe"
$manifest = [ordered]@{
    version = $Version
    url     = "$repo/releases/latest/download/$installer"
    notes   = $Notes
} | ConvertTo-Json
Write-TextFile 'latest.json' $manifest

# NSIS only: the WiX/MSI toolchain fails on this machine and the updater uses the NSIS installer.
npm run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'Build failed (close the running app first).' }

$installerPath = "src-tauri\target\release\bundle\nsis\$installer"
if (-not (Test-Path -LiteralPath $installerPath)) { throw "Installer not found at $installerPath" }

if ($NoPublish) {
    Write-Host ""
    Write-Host "Built v$Version. Publish skipped; attach these to a release tagged v${Version}:" -ForegroundColor Yellow
    Write-Host "  $installerPath"
    Write-Host "  latest.json"
    return
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI not found. Install it with 'winget install GitHub.cli', run 'gh auth login', or rerun with -NoPublish."
}

git add -A
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }

# Nothing to commit is fine; the version bump may already be committed.
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -q -m "Release v$Version"
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
}

git tag -a "v$Version" -m "v$Version" 2>$null
git push
if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }
git push origin "v$Version"
if ($LASTEXITCODE -ne 0) { throw "Pushing tag v$Version failed." }

$releaseNotes = if ($Notes) { $Notes } else { "Release v$Version" }
gh release create "v$Version" $installerPath 'latest.json' --title "v$Version" --notes $releaseNotes --latest
if ($LASTEXITCODE -ne 0) { throw "gh release create failed for v$Version." }

Write-Host ""
Write-Host "Published v$Version. Other machines will see the update banner on next launch." -ForegroundColor Green
Write-Host "  $repo/releases/latest/download/latest.json"
