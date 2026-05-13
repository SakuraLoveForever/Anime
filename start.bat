@echo off
chcp 65001 >nul
title 追番管理器

:: 关闭旧的 cmd 窗口和后端进程
taskkill /fi "WINDOWTITLE eq 追番管理器*" /fi "IMAGENAME eq cmd.exe" /f 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING 2^>nul') do taskkill /f /pid %%a 2>nul

echo 正在启动后端服务...
start /b node server.js
timeout /t 2 /nobreak >nul

echo 正在打开浏览器...
start "" http://localhost:3456

echo.
echo 后端运行中: http://localhost:3456
echo 关闭此窗口即可停止后端。
echo.
pause
