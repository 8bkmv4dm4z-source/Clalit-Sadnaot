@echo off
setlocal enableextensions enabledelayedexpansion
title Clalit Workshops — Local LAN Launcher

:: --- Detect current LAN IPv4 (Windows) ---
for /f "tokens=14 delims= " %%a in ('ipconfig ^| findstr /r "IPv4.*"') do (
  if not defined LAN_IP set LAN_IP=%%a
)
if not defined LAN_IP (
  echo Could not auto-detect LAN IP. Falling back to 127.0.0.1
  set LAN_IP=127.0.0.1
)

echo ----------------------------------------------------------
echo LAN IP: %LAN_IP%
echo Node:   %~dp0
echo ----------------------------------------------------------

:: --- Environment (local) ---
set NODE_ENV=production
set HOST=0.0.0.0
set PORT=5000
:: Allow local + LAN client:
set ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://%LAN_IP%:5173,http://localhost:%PORT%,http://%LAN_IP%:%PORT%
set PUBLIC_URL=http://%LAN_IP%:%PORT%
set VITE_API_BASE=%PUBLIC_URL%
:: --- 1) Build client (Vite) ---
echo [1/3] Building client...
pushd client
if not exist node_modules (
  echo Installing client deps...
  call npm install
)
:: Optionally expose VITE vars for API base:
set VITE_API_BASE=http://%LAN_IP%:%PORT%
call npx vite build
popd

:: --- 2) Start server (bind to 0.0.0.0) ---
echo [2/3] Starting server...
pushd server
if not exist node_modules (
  echo Installing server deps...
  call npm install
)
:: Ensure server reads HOST/PORT/ALLOWED_ORIGINS from process.env
start "Server" cmd /c node server.js
popd

:: --- 3) Open browser to LAN URL ---
echo [3/3] Opening browser...
timeout /t 5 >nul
start "" "http://%LAN_IP%:%PORT%"

echo ----------------------------------------------------------
echo ✅ Server running at:  http://%LAN_IP%:%PORT%
echo ✅ Client built in:    client/dist
echo ----------------------------------------------------------
pause