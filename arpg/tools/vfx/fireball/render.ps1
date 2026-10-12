param(
  [string]$Skill = 'C:\Users\user\AppData\Local\Temp\arpg-fx1\arpg-fx1-effekseer-vfx-skill\skills\effekseer-vfx',
  [string]$Project = 'C:\Users\user\AppData\Local\Temp\arpg-fx1\bake',
  [string]$Godot = 'C:\Users\user\tools\godot-4.7.2-fx1\Godot_v4.7.2-stable_win64_console.exe',
  [string]$Frames = 'C:\Users\user\AppData\Local\Temp\arpg-fx1\frames'
)
# Installed toolchain only; no global skill installation, PATH edits or game checkout writes.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $Project)
$env:GODOT = $Godot
$vfx = Join-Path $Skill 'scripts\vfx.cmd'
& $vfx --project $Project doctor
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $vfx --project $Project build --ids VFX_Projectile_Fire VFX_Fire_Explosion
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $vfx --project $Project review --ids VFX_Projectile_Fire VFX_Fire_Explosion --step 3 --profile bare --note 'FX1 native baseline'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$lab = Join-Path $Project 'vfx\godot'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Bake.gd') -Destination (Join-Path $lab 'scripts\Bake.gd')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Bake.tscn') -Destination (Join-Path $lab 'Bake.tscn')
$env:FX1_FRAMES = $Frames
& $Godot --path $lab --fixed-fps 60 --resolution 256x256 res://Bake.tscn
exit $LASTEXITCODE
