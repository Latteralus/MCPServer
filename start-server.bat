@echo off
title HIPAA-Compliant Chat Server
echo ===================================================
echo  HIPAA-Compliant Chat Server
echo ===================================================
echo.
echo  Starting server on default port 3000...
echo  Once started, you can access the status page at:
echo  http://localhost:3000
echo.
echo  To stop the server, close this window.
echo ===================================================
echo.

:: Check if executable version exists and run it
if exist hipaa-chat-server.exe (
  echo Found standalone executable. Running...
  hipaa-chat-server.exe
) else (
  :: Check if node is installed
  where node >nul 2>&1
  if %ERRORLEVEL% == 0 (
    echo Found Node.js. Running with Node...
    node chatServer.js
  ) else (
    echo ERROR: Neither standalone executable nor Node.js found.
    echo Please install Node.js or download the executable version.
    echo.
    pause
    exit /b 1
  )
)

:: If the server exits, pause to see any errors
pause