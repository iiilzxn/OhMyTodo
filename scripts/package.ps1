param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $taskRoot
try {
    if (-not $SkipBuild) {
        & pnpm.cmd tauri build --bundles nsis
        if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
    }
    $taskPackage = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
    $taskVersion = $taskPackage.version
    $taskRelease = Join-Path $taskRoot 'src-tauri\target\release'
    $taskOutput = Join-Path $taskRoot 'output\app'
    $taskInstallerName = "OhMyTodo_${taskVersion}_x64-setup.exe"
    $taskInstaller = Join-Path $taskRelease "bundle\nsis\$taskInstallerName"
    foreach ($taskSource in @((Join-Path $taskRelease 'ohmytodo.exe'), $taskInstaller)) {
        if (-not (Test-Path -LiteralPath $taskSource -PathType Leaf)) { throw "Missing build output: $taskSource" }
    }
    New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskRelease 'ohmytodo.exe') -Destination (Join-Path $taskOutput 'OhMyTodo.exe') -Force
    Copy-Item -LiteralPath $taskInstaller -Destination (Join-Path $taskOutput $taskInstallerName) -Force
    Copy-Item -LiteralPath (Join-Path $taskRoot 'README.md') -Destination (Join-Path $taskOutput 'README.md') -Force
    Copy-Item -LiteralPath (Join-Path $taskRoot 'THIRD_PARTY_NOTICES.md') -Destination (Join-Path $taskOutput 'THIRD_PARTY_NOTICES.md') -Force
    $taskHashes = Get-ChildItem -LiteralPath $taskOutput -Filter '*.exe' -File | Get-FileHash -Algorithm SHA256 | Select-Object @{Name='File';Expression={Split-Path -Leaf $_.Path}},Hash
    $taskManifest = [ordered]@{ Version=$taskVersion; Platform='Windows x64'; BuiltAt=(Get-Date).ToString('o'); Files=@($taskHashes) }
    [IO.File]::WriteAllText((Join-Path $taskOutput 'checksums.json'), ($taskManifest | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    Get-ChildItem -LiteralPath $taskOutput -File | Select-Object Name,Length
}
finally { Pop-Location }
