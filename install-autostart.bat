@echo off
setlocal

set "TASK_NAME=AnimeTrackerBackend"
set "PROJECT_DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js and make sure node is available in PATH.
  pause
  exit /b 1
)

echo Creating startup task: %TASK_NAME%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$taskName = '%TASK_NAME%';" ^
  "$projectDir = (Resolve-Path -LiteralPath '%PROJECT_DIR%').Path;" ^
  "$node = (Get-Command node -ErrorAction Stop).Source;" ^
  "$action = New-ScheduledTaskAction -Execute $node -Argument 'server.js' -WorkingDirectory $projectDir;" ^
  "$trigger = New-ScheduledTaskTrigger -AtLogOn;" ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew;" ^
  "Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Start Anime tracker backend at logon.' -Force | Out-Null"

if errorlevel 1 (
  echo Failed to create the task. Try right-clicking this file and choosing "Run as administrator".
  pause
  exit /b 1
)

echo Starting backend now...
schtasks /run /tn "%TASK_NAME%" >nul 2>nul

echo.
echo Done. The backend will start automatically after you log in.
echo Open this URL in your browser: http://localhost:3456
echo.
pause
