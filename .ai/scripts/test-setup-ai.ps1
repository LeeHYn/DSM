$ErrorActionPreference = 'Stop'
$sourceScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\setup-ai.ps1'))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixtureRoot = Join-Path $tempRoot ('dsm-setup-regression-' + [guid]::NewGuid().ToString('N'))
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Symlink privileges are deliberately unavailable; memory preservation must not depend on them.
function New-Item {
    param($Path, $ItemType, [switch]$Force, $Target, $ErrorAction)
    if ($ItemType -eq 'SymbolicLink') { throw 'Synthetic symlink privilege failure' }
    Microsoft.PowerShell.Management\New-Item -Path $Path -ItemType $ItemType -Force:$Force -ErrorAction Stop
}

try {
    New-Item -Path $fixtureRoot -ItemType Directory | Out-Null
    Copy-Item -LiteralPath $sourceScript -Destination (Join-Path $fixtureRoot 'setup-ai.ps1')
    New-Item -Path (Join-Path $fixtureRoot '.ai\memory') -ItemType Directory -Force | Out-Null
    $preserved = @('.ai\system_prompt.md', '.ai\memory\plan.md', '.ai\memory\context.md', '.ai\memory\checklist.md', 'AGENTS.md', 'CLAUDE.md')
    $expected = @{}
    foreach ($relative in $preserved) {
        $file = Join-Path $fixtureRoot $relative
        [IO.File]::WriteAllText($file, ('keep original ' + $relative + "`r`n"), $utf8)
        $expected[$relative] = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file))
    }
    Push-Location $fixtureRoot
    try {
        & (Join-Path $fixtureRoot 'setup-ai.ps1') | Out-Null
        & (Join-Path $fixtureRoot 'setup-ai.ps1') | Out-Null
    } finally { Pop-Location }
    foreach ($relative in $preserved) {
        $actual = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot $relative)))
        if ($actual -ne $expected[$relative]) { throw ('Existing file changed: ' + $relative) }
    }

    # A partial checkout may lack memory files. Initialization creates only missing files.
    $freshRoot = Join-Path $fixtureRoot 'fresh'
    New-Item -Path $freshRoot -ItemType Directory | Out-Null
    Copy-Item -LiteralPath $sourceScript -Destination (Join-Path $freshRoot 'setup-ai.ps1')
    Push-Location $freshRoot
    try { & (Join-Path $freshRoot 'setup-ai.ps1') | Out-Null } finally { Pop-Location }
    foreach ($relative in @('.ai\system_prompt.md', '.ai\memory\plan.md', '.ai\memory\context.md', '.ai\memory\checklist.md')) {
        if (-not (Test-Path -LiteralPath (Join-Path $freshRoot $relative) -PathType Leaf)) {
            throw ('Missing initialized file: ' + $relative)
        }
    }
    $prompt = [IO.File]::ReadAllText((Join-Path $freshRoot '.ai\system_prompt.md'), [Text.Encoding]::UTF8)
    $identityHeading = [string][char]0xC815 + [char]0xCCB4 + [char]0xC131
    if (-not $prompt.Contains($identityHeading)) { throw 'Initialized prompt has corrupted Korean text' }
    Write-Output 'PASS: repeated setup preserves six existing files byte-for-byte; missing files initialize despite symlink failure.'
} finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
    $expectedPrefix = (Join-Path $tempRoot 'dsm-setup-regression-')
    if (-not $resolvedFixture.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetDirectoryName($resolvedFixture) -ne $tempRoot.TrimEnd('\')) {
        throw 'Refusing cleanup outside the generated setup fixture'
    }
    if (Test-Path -LiteralPath $resolvedFixture) {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
}
