@echo off
chcp 65001 >nul
title Смена — локальный сервер
cd /d "%~dp0"

rem ---- Node 20+: в cmd профиль не работает, берём версию из nvm сами ----
set "NVM_DIR=%LOCALAPPDATA%\nvm"
set "NODE_DIR="
if exist "%NVM_DIR%\v25.9.0\node.exe" set "NODE_DIR=%NVM_DIR%\v25.9.0"
if not defined NODE_DIR for /d %%D in ("%NVM_DIR%\v2*") do set "NODE_DIR=%%~fD"
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo [x] Node не найден. Поставьте Node 20+ или nvm-windows.
  pause
  exit /b 1
)
node -e "process.exit(+process.versions.node.split('.')[0]>=20?0:1)" >nul 2>nul
if errorlevel 1 (
  echo [x] Нужен Node 20 или новее, а в PATH:
  node -v
  pause
  exit /b 1
)
for /f %%v in ('node -v') do echo [ok] Node %%v

rem ---- освобождаем порт 8787 от прошлых запусков ----
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":8787 " ^| findstr /c:"LISTENING"') do (
  echo [..] порт 8787 занят процессом %%p — снимаю
  taskkill /f /pid %%p >nul 2>nul
)

rem ---- зависимости и сборка ----
if not exist node_modules (
  echo [..] npm install — первый запуск, может занять пару минут
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)
echo [..] сборка клиента
call npm run build
if errorlevel 1 ( pause & exit /b 1 )

echo.
echo  ===================================================
echo    игроки:   http://localhost:8787
echo    табло:    http://localhost:8787/#/board
echo    ведущий:  http://localhost:8787/#/host
echo    пароль ведущего: smena
echo    адрес для телефонов в сети напечатает сервер
echo    остановить: Ctrl+C или закрыть это окно
echo  ===================================================
echo.

if not defined SMENA_NO_BROWSER start "" http://localhost:8787

node server\src\index.js
echo.
echo Сервер остановлен.
pause
