param(
  [string]$Root,
  [switch]$Remove
)
# ASCII only. Creates (or removes) the "Nomerki" shortcut in Startup and on the Desktop.
$Root = (Resolve-Path $Root).Path
$name = -join ([char[]](1053, 1086, 1084, 1077, 1088, 1082, 1080))   # the word "Nomerki" in Russian
$w = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('Desktop'))) {
  $lnk = Join-Path $dir "$name.lnk"
  if ($Remove) {
    if (Test-Path $lnk) { Remove-Item $lnk -Force }
    continue
  }
  $s = $w.CreateShortcut($lnk)
  $s.TargetPath = 'wscript.exe'
  $s.Arguments = '"' + (Join-Path $Root 'autostart\launch.vbs') + '"'
  $s.WorkingDirectory = $Root
  $s.Save()
}
