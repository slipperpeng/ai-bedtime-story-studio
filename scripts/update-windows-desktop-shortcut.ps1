param([switch]$Launch)

$ErrorActionPreference = 'Stop'

$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\ai-bedtime-story-studio'
# Build the Chinese product name from code points so Windows PowerShell 5.1 does
# not depend on whether this UTF-8 script has a BOM.
$productName = -join @([char]0x6795, [char]0x8FB9, [char]0x9020, [char]0x68A6)
$targetCandidates = @(
  (Join-Path $installDirectory "$productName.exe"),
  (Join-Path $installDirectory 'AI-Bedtime-Story-Studio.exe')
)
$targetPath = $targetCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $targetPath) {
  throw "Installed application was not found in: $installDirectory"
}

$desktopDirectory = [Environment]::GetFolderPath('Desktop')
$temporaryShortcut = Join-Path $desktopDirectory 'AI-Bedtime-Story-Studio.lnk'
$finalShortcut = Join-Path $desktopDirectory "$productName.lnk"

Remove-Item -LiteralPath $temporaryShortcut -Force -ErrorAction SilentlyContinue
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($temporaryShortcut)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $installDirectory
$shortcut.IconLocation = "$targetPath,0"
$shortcut.Description = "$productName - AI Bedtime Story Studio"
$shortcut.Save()

Remove-Item -LiteralPath $finalShortcut -Force -ErrorAction SilentlyContinue
Move-Item -LiteralPath $temporaryShortcut -Destination $finalShortcut

$verifiedShortcut = $shell.CreateShortcut($finalShortcut)
if ($verifiedShortcut.TargetPath -ne $targetPath) {
  throw "Desktop shortcut target is invalid: $($verifiedShortcut.TargetPath)"
}
$productVersion = (Get-Item -LiteralPath $targetPath).VersionInfo.ProductVersion
Write-Output "Shortcut=$finalShortcut"
Write-Output "Target=$($verifiedShortcut.TargetPath)"
Write-Output "Version=$productVersion"

if ($Launch) {
  Start-Process -FilePath $finalShortcut -WindowStyle Hidden
  Start-Sleep -Seconds 3
  $running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -eq $targetPath } catch { $false }
  }
  if (-not $running) {
    throw 'The desktop shortcut did not start the installed application.'
  }
  Write-Output "RunningProcesses=$($running.Count)"
}
