param([Parameter(Mandatory=$true)][string]$Config,[string]$Project='C:\Users\user\AppData\Local\Temp\arpg-fx2\bake',[string]$Skill='C:\Users\user\AppData\Local\Temp\arpg-fx1\arpg-fx1-effekseer-vfx-skill\skills\effekseer-vfx',[string]$Godot='C:\Users\user\tools\godot-4.7.2-fx1\Godot_v4.7.2-stable_win64_console.exe')
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $Project)
$env:GODOT=$Godot
$ids=(Get-Content -Raw -LiteralPath $Config | ConvertFrom-Json).clips.id
& (Join-Path $Skill 'scripts\vfx.cmd') --project $Project build --ids @ids
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$lab=Join-Path $Project 'vfx\godot'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Bake.gd') -Destination (Join-Path $lab 'scripts\Bake.gd')
# The source .efkefc must be reimported: copying a pre-existing .godot cache alone is stale.
& $Godot --headless --editor --path $lab --import
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$env:FX2_CONFIG=$Config
& $Godot --path $lab --fixed-fps 60 --resolution 256x256 res://Bake.tscn
exit $LASTEXITCODE
