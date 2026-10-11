@echo off
chcp 65001 >nul
title 木作设计台 v5 · mbs-studio
cd /d "%~dp0"

echo.
echo   ============================================
echo    木作设计台 v5 · mbs-studio
echo   ============================================
echo.

rem ---- 定位 Node（优先 PATH，其次 WorkBuddy 托管版本）----
set "NODE="
where node >nul 2>nul && set "NODE=node"

if not defined NODE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\24.14.0\node.exe" set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\24.14.0\node.exe"
if not defined NODE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
if not defined NODE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"

if not defined NODE (
  echo   [错误] 未找到 Node.js。
  echo   请安装 Node 22+ 或确认 .workbuddy\binaries\node 下的版本目录名。
  pause
  exit /b 1
)

echo   使用 Node: %NODE%
echo   地址:  http://127.0.0.1:7891
echo   MCP :  http://127.0.0.1:7891/mcp
echo.
echo   关闭本窗口即停止服务。
echo.

"%NODE%" "node_modules\tsx\dist\cli.mjs" server\index.ts

pause
