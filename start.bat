@echo off
REM ==========================================================================
REM  start.bat - one-click local HTTP server for the MODULAR version (index.html)
REM
REM  Why a server at all?
REM    index.html uses native ES Modules (<script type="module">). Browsers
REM    BLOCK module scripts loaded over file:// (CORS, origin 'null'), so the
REM    modular build only works over http(s). This script starts a tiny static
REM    server and opens the browser for you.
REM
REM  Do you even need this?
REM    No - for "double-click and play" just open:
REM        dist\isaac-standalone.html
REM    That single file is fully self-contained (no server, no network).
REM
REM  NOTE: This file is intentionally pure ASCII to avoid Windows codepage
REM        issues corrupting paths or filenames.
REM ==========================================================================

setlocal
set "PORT=8080"
cd /d "%~dp0"

set "SRV="

where python >nul 2>nul
if %ERRORLEVEL%==0 set "SRV=python -m http.server %PORT%"

if not defined SRV (
  where py >nul 2>nul
  if %ERRORLEVEL%==0 set "SRV=py -m http.server %PORT%"
)

if not defined SRV (
  where node >nul 2>nul
  if %ERRORLEVEL%==0 set "SRV=npx --yes serve -l %PORT% ."
)

if not defined SRV (
  echo [start] ERROR: neither Python nor Node was found on this machine.
  echo [start] TIP  : just double-click dist\isaac-standalone.html - no server needed.
  pause
  exit /b 1
)

echo [start] Serving "%CD%" on http://127.0.0.1:%PORT%
echo [start] A minimized window named "Isaac Local Server" is running the server.
echo [start] Close that window to stop the server.
echo [start] Opening browser ...

REM Start the server in a separate minimized window (inherits current dir).
start "Isaac Local Server" /min cmd /c "%SRV%"

REM Give the server a moment to bind the port, then open the browser.
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"

exit /b 0
