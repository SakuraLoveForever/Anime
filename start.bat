@echo off
chcp 65001 >nul
title 追番管理器

:: Always run from the directory that contains this file.
cd /d "%~dp0"

echo.
echo ==============================
echo        追番管理器
echo ==============================
echo.

if not exist "package.json" (
  echo [错误] 找不到 package.json，请从项目根目录启动。
  goto :FAIL
)

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 20 或更高版本。
  echo 下载地址: https://nodejs.org/
  goto :FAIL
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 npm。请重新安装 Node.js，然后重新打开此窗口。
  goto :FAIL
)

:: A failed npm install can leave a partial node_modules directory.
:: Check the modules used directly by server.js instead of only checking the folder.
set "NEED_INSTALL="
for %%P in (express cors cheerio) do if not exist "node_modules\%%P\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\@supabase\supabase-js\package.json" set "NEED_INSTALL=1"

if defined NEED_INSTALL (
  echo [1/2] 正在安装依赖，首次启动可能需要几分钟...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败。请在此窗口运行 npm install 查看详细错误。
    goto :FAIL
  )
) else (
  echo [1/2] 依赖已安装。
)

:: Reuse an already-running Anime tracker instead of starting a duplicate server.
call :CHECK_HEALTH
if not errorlevel 1 goto :READY

echo [2/2] 正在启动服务...
start "追番管理器后端" /b node server.js

:: Wait until the HTTP endpoint is ready before opening the browser.
for /l %%I in (1,1,30) do (
  call :CHECK_HEALTH
  if not errorlevel 1 goto :READY
  timeout /t 1 /nobreak >nul
)

echo.
echo [错误] 服务在 30 秒内没有启动成功。
echo 请运行 npm start 查看完整错误信息。
goto :FAIL

:READY
echo.
echo 服务已启动: http://localhost:3456
start "" http://localhost:3456/
echo 浏览器已打开。关闭此窗口即可停止此启动脚本。
echo.
pause
exit /b 0

:CHECK_HEALTH
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3456/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:FAIL
echo.
pause
exit /b 1
