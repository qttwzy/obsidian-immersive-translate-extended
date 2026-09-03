[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PluginPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$Commit,

  [string]$EvidencePath,
  [string]$ObsidianVersion,
  [string]$EvidenceUrl,
  [string]$RuntimeVersion,
  [switch]$Interactive
)

$ErrorActionPreference = "Stop"

function Add-Check {
  param(
    [System.Collections.Generic.List[object]]$List,
    [string]$Name,
    [string]$Status,
    [string]$Detail
  )
  $List.Add([ordered]@{ name = $Name; status = $Status; detail = $Detail })
}

function Require-Check {
  param(
    [System.Collections.Generic.List[object]]$List,
    [string]$Name,
    [bool]$Condition,
    [string]$Detail
  )
  if (-not $Condition) {
    Add-Check -List $List -Name $Name -Status "failed" -Detail $Detail
    throw "Windows validation failed: $Name — $Detail"
  }
  Add-Check -List $List -Name $Name -Status "passed" -Detail $Detail
}

function Read-JsonFile {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing ${Label}: $Path"
  }
  try {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    throw "Invalid ${Label}: $($_.Exception.Message)"
  }
}

function Write-JsonFile {
  param([string]$Path, [object]$Value)
  $Path = [System.IO.Path]::GetFullPath($Path)
  $parent = Split-Path -Parent $Path
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $temporary = "$Path.tmp-$PID"
  $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -Force -LiteralPath $temporary -Destination $Path
}

$checks = New-Object 'System.Collections.Generic.List[object]'
$resolvedPluginPath = (Resolve-Path -LiteralPath $PluginPath).Path
$manifestPath = Join-Path $resolvedPluginPath "manifest.json"
$manifest = Read-JsonFile -Path $manifestPath -Label "plugin manifest"

Require-Check -List $checks -Name "plugin-id" -Condition ([string]$manifest.id -eq "immersive-translate-extended") -Detail "manifest id is $($manifest.id)"
$pluginVersion = [string]$manifest.version
$minimumObsidianVersion = [string]$manifest.minAppVersion
Require-Check -List $checks -Name "plugin-version" -Condition ($pluginVersion -match '^\d+\.\d+\.\d+$') -Detail "plugin version is $pluginVersion"
Require-Check -List $checks -Name "minimum-obsidian-version" -Condition ($minimumObsidianVersion -match '^\d+\.\d+\.\d+$') -Detail "minimum Obsidian version is $minimumObsidianVersion"

$requiredFiles = @(
  "main.js",
  "dashboard-preload.js",
  "document-preload.js",
  "document-runtime.js",
  "manifest.json",
  "styles.css"
)
foreach ($name in $requiredFiles) {
  $path = Join-Path $resolvedPluginPath $name
  $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
  $regular = $null -ne $item -and $item.PSIsContainer -eq $false -and $item.Attributes.ToString().IndexOf("ReparsePoint", [System.StringComparison]::OrdinalIgnoreCase) -lt 0
  Require-Check -List $checks -Name "file:$name" -Condition $regular -Detail "regular file present"
}

$mainSource = Get-Content -LiteralPath (Join-Path $resolvedPluginPath "main.js") -Raw -Encoding UTF8
$dashboardSource = Get-Content -LiteralPath (Join-Path $resolvedPluginPath "dashboard-preload.js") -Raw -Encoding UTF8
Require-Check -List $checks -Name "generated-plugin-version" -Condition ($mainSource -match ('PLUGIN_VERSION\s*=\s*["'']' + [regex]::Escape($pluginVersion) + '["'']')) -Detail "main.js embeds the manifest version"
Require-Check -List $checks -Name "dashboard-bridge-version" -Condition ($dashboardSource -match ('BRIDGE_VERSION\s*=\s*["'']' + [regex]::Escape($pluginVersion) + '["'']')) -Detail "dashboard-preload.js embeds the manifest version"

$node = Get-Command node -ErrorAction SilentlyContinue
foreach ($name in @("main.js", "dashboard-preload.js", "document-preload.js", "document-runtime.js")) {
  if ($null -eq $node) {
    Add-Check -List $checks -Name "syntax:$name" -Status "skipped" -Detail "node was not found on PATH"
    continue
  }
  $path = Join-Path $resolvedPluginPath $name
  $output = & $node.Source --check $path 2>&1
  if ($LASTEXITCODE -ne 0) {
    Add-Check -List $checks -Name "syntax:$name" -Status "failed" -Detail ([string]::Join(" ", @($output)))
    throw "Windows validation failed: syntax:$name"
  }
  Add-Check -List $checks -Name "syntax:$name" -Status "passed" -Detail "node --check passed"
}

$runtimePath = Join-Path $resolvedPluginPath "userscript.runtime.js"
$detectedRuntimeVersion = ""
if (Test-Path -LiteralPath $runtimePath -PathType Leaf) {
  $runtimeSource = Get-Content -LiteralPath $runtimePath -Raw -Encoding UTF8
  $blocks = [regex]::Matches($runtimeSource, '(?ms)^[ \t]*//[ \t]*==UserScript==[ \t]*\r?\n(.*?)^[ \t]*//[ \t]*==/UserScript==[ \t]*$')
  Require-Check -List $checks -Name "runtime-metadata-block" -Condition ($blocks.Count -eq 1) -Detail "one complete userscript metadata block is present"
  $versions = [regex]::Matches($blocks[0].Groups[1].Value, '(?m)^[ \t]*//[ \t]*@version[ \t]+([^\s]+)[ \t]*$')
  Require-Check -List $checks -Name "runtime-version" -Condition ($versions.Count -eq 1 -and $versions[0].Groups[1].Value -match '^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') -Detail "one valid runtime version is present"
  $detectedRuntimeVersion = $versions[0].Groups[1].Value
} else {
  Add-Check -List $checks -Name "runtime-version" -Status "pending" -Detail "runtime is not installed in this profile"
}
if ($RuntimeVersion) {
  Require-Check -List $checks -Name "runtime-version-input" -Condition ($detectedRuntimeVersion -eq $RuntimeVersion) -Detail "installed runtime version matches the supplied version"
}

$manual = [ordered]@{}
if ($Interactive) {
  Require-Check -List $checks -Name "interactive-obsidian-version" -Condition (-not [string]::IsNullOrWhiteSpace($ObsidianVersion)) -Detail "Obsidian version was supplied"
  try { $hostVersion = [version]$ObsidianVersion; $minimumVersion = [version]$minimumObsidianVersion } catch { throw "Invalid Obsidian version input" }
  Require-Check -List $checks -Name "interactive-minimum-obsidian" -Condition ($hostVersion -ge $minimumVersion) -Detail "Obsidian $ObsidianVersion meets the minimum $minimumObsidianVersion"
  Require-Check -List $checks -Name "interactive-evidence-url" -Condition ($EvidenceUrl -match '^https://') -Detail "evidence URL uses HTTPS"
  Require-Check -List $checks -Name "interactive-runtime" -Condition (-not [string]::IsNullOrWhiteSpace($detectedRuntimeVersion)) -Detail "a runtime is installed for the acceptance run"

  $questions = [ordered]@{
    installRestart = "Fresh ZIP install, enable, restart, disable, and re-enable completed?"
    settingsStatus = "Settings showed local/current runtime versions and the matching-version button was disabled?"
    accountDashboard = "Account name/status, Dashboard open, login, sync, and restart recovery completed?"
    readingTranslation = "Reading View bilingual, translation-only, selection, hover, and scope checks completed?"
    pdfWorkspace = "PDF header/command, handoff, manual workspace, export, cancel, and failure checks completed?"
    conflictHandling = "Conflict detection and explicit user choice checks completed?"
    offlineAndErrors = "Offline startup and missing/invalid/unavailable-runtime error checks completed?"
    uninstallReinstall = "Uninstall/reinstall and data.json preservation checks completed?"
  }
  foreach ($entry in $questions.GetEnumerator()) {
    $answer = (Read-Host ($entry.Value + " [y/N]")).Trim().ToLowerInvariant()
    if ($answer -notin @("y", "yes")) {
      throw "Windows acceptance is incomplete: $($entry.Key)"
    }
    $manual[$entry.Key] = $true
  }
} else {
  $manual["status"] = "pending-interactive-acceptance"
}

$status = if ($Interactive) { "passed" } else { "pending" }
$windowsRecord = [ordered]@{
  status = $status
  runtimeVersion = if ($RuntimeVersion) { $RuntimeVersion } else { $detectedRuntimeVersion }
  evidence = if ($EvidenceUrl) { $EvidenceUrl } else { "" }
}

$macosRecord = [ordered]@{ status = "pending"; runtimeVersion = ""; evidence = "" }
if ($EvidencePath -and (Test-Path -LiteralPath $EvidencePath -PathType Leaf)) {
  $existing = Read-JsonFile -Path $EvidencePath -Label "platform evidence"
  if ($existing.schemaVersion -ne 1) { throw "Unsupported platform evidence schema" }
  if ([string]$existing.pluginVersion -ne $pluginVersion) { throw "Platform evidence plugin version differs" }
  if ([string]$existing.minimumObsidianVersion -ne $minimumObsidianVersion) { throw "Platform evidence Obsidian version differs" }
  if ([string]$existing.commit -ne $Commit) { throw "Platform evidence commit differs" }
  if ($existing.platforms -and $existing.platforms.macos) { $macosRecord = [ordered]@{ status = [string]$existing.platforms.macos.status; runtimeVersion = [string]$existing.platforms.macos.runtimeVersion; evidence = [string]$existing.platforms.macos.evidence } }
}

$platforms = [ordered]@{}
$platforms.macos = $macosRecord
$platforms.windows = $windowsRecord
$windowsReport = [ordered]@{}
$windowsReport.obsidianVersion = $ObsidianVersion
$windowsReport.pluginPath = $resolvedPluginPath
$windowsReport.checks = $checks.ToArray()
$windowsReport.manual = $manual
$reports = [ordered]@{}
$reports.windows = $windowsReport
$record = [ordered]@{}
$record.schemaVersion = 1
$record.pluginVersion = $pluginVersion
$record.minimumObsidianVersion = $minimumObsidianVersion
$record.commit = $Commit.ToLowerInvariant()
$record.testedAt = (Get-Date).ToUniversalTime().ToString("o")
$record.platforms = $platforms
$record.reports = $reports

$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
Write-JsonFile -Path $resolvedOutputPath -Value $record
Write-Output ($record | ConvertTo-Json -Depth 20)
