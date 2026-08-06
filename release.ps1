# Bumps the version, validates the project, then pushes a release tag.
# GitHub Actions builds the installer and publishes the GitHub release.
# Usage: .\release.ps1 0.3.0 "What changed"
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [string]$Notes = "",
    # Stops after validation, leaving the version changes uncommitted.
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
    if (-not [regex]::IsMatch($text, $Pattern)) { throw "Version pattern not found in $Path" }
    $updated = [regex]::Replace($text, $Pattern, $Replacement, 1)
    if ($updated -ne $text) { Write-TextFile $Path $updated }
}

$tag = "v$Version"
git rev-parse --verify --quiet "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) { throw "Tag $tag already exists locally." }

npm.cmd version $Version --no-git-tag-version --allow-same-version
if ($LASTEXITCODE -ne 0) { throw 'Updating package version failed.' }

Set-FileText 'src-tauri\Cargo.toml'      '(?m)^version = "\d+\.\d+\.\d+"' "version = `"$Version`""
Set-FileText 'src-tauri\tauri.conf.json' '"version": "\d+\.\d+\.\d+"'    "`"version`": `"$Version`""

$installer = "codex-model-switcher_${Version}_x64-setup.exe"
$manifest = [ordered]@{
    version = $Version
    url     = "$repo/releases/latest/download/$installer"
    notes   = $Notes
} | ConvertTo-Json
Write-TextFile 'latest.json' $manifest

node node_modules\typescript\bin\tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
cargo test --manifest-path src-tauri\Cargo.toml
if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed.' }
cargo clippy --manifest-path src-tauri\Cargo.toml --lib --all-targets -- -D warnings
if ($LASTEXITCODE -ne 0) { throw 'Clippy failed.' }
npm.cmd run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'NSIS build failed (close the running app first).' }

$installerPath = "src-tauri\target\release\bundle\nsis\$installer"
if (-not (Test-Path -LiteralPath $installerPath)) { throw "Installer not found at $installerPath" }

if ($NoPublish) {
    Write-Host ""
    Write-Host "Built $tag. Commit and push skipped." -ForegroundColor Yellow
    Write-Host "  $installerPath"
    return
}

git add -A
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }

# Nothing to commit is fine; the version bump may already be committed.
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -q -m "Release v$Version"
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
}

git tag -a $tag -m $tag
if ($LASTEXITCODE -ne 0) { throw "Creating tag $tag failed." }

$branch = git branch --show-current
if (-not $branch) { throw 'Cannot publish from a detached HEAD.' }
git push --atomic origin $branch $tag
if ($LASTEXITCODE -ne 0) { throw "Push failed. Retry with: git push --atomic origin $branch $tag" }

Write-Host ""
Write-Host "Pushed $tag. GitHub Actions is building and publishing the release." -ForegroundColor Green
Write-Host "  Local installer: $installerPath"
Write-Host "  $repo/actions"
