[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$MarketplaceRoot = Join-Path $ProjectRoot 'build\marketplace'
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$CqbDataRoot = Join-Path $CodexHome 'cqb'
$ConfigPath = Join-Path $CqbDataRoot 'config.yaml'

Push-Location $ProjectRoot
try {
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE" }
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed with exit code $LASTEXITCODE" }
    pnpm package:plugin
    if ($LASTEXITCODE -ne 0) { throw "pnpm package:plugin failed with exit code $LASTEXITCODE" }
    New-Item -ItemType Directory -Path $CqbDataRoot -Force | Out-Null
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot 'config.example.yaml') -Destination $ConfigPath
    }
    $marketplaceJson = codex plugin marketplace list --json
    if ($LASTEXITCODE -ne 0) { throw "codex plugin marketplace list failed with exit code $LASTEXITCODE" }
    $marketplaces = ($marketplaceJson | ConvertFrom-Json).marketplaces
    $existing = $marketplaces | Where-Object { $_.name -eq 'cqb-local' } | Select-Object -First 1
    if ($existing -and ((Resolve-Path -LiteralPath $existing.root).Path -ne (Resolve-Path -LiteralPath $MarketplaceRoot).Path)) {
        throw "Marketplace 'cqb-local' already points to a different path: $($existing.root)"
    }
    if (-not $existing) {
        codex plugin marketplace add $MarketplaceRoot
        if ($LASTEXITCODE -ne 0) { throw "codex plugin marketplace add failed with exit code $LASTEXITCODE" }
    }
    codex plugin add 'codex-quota-bridge@cqb-local' --json
    if ($LASTEXITCODE -ne 0) { throw "codex plugin add failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

Write-Host "Codex Quota Bridge is installed. Configuration: $ConfigPath"
