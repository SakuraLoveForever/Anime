@echo off
setlocal

set "TASK_NAME=AnimeTrackerBackend"

echo Deleting startup task: %TASK_NAME%
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>nul

if errorlevel 1 (
  echo The task was not found, or deletion failed.
) else (
  echo Deleted. The backend will no longer start automatically.
)

echo.
pause
