@echo off
setlocal EnableExtensions
cd /d "%~dp0"

py --version >nul 2>nul
if errorlevel 1 goto try_python
set "PYTHON_CMD=py"
goto start_server

:try_python
python --version >nul 2>nul
if errorlevel 1 goto python_missing
set "PYTHON_CMD=python"
goto start_server

:python_missing
echo [Route Atlas] Python 3 was not found.
echo Please install Python 3 or use a local HTTP server.
echo See README.md for manual setup.
pause
exit /b 1

:start_server
echo.
echo [Route Atlas] Starting local server at http://127.0.0.1:8000/
echo Keep the new server window open while using Route Atlas.
echo.
start "Route Atlas Local Server" cmd /k "%PYTHON_CMD% -m http.server 8000 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/"
endlocal
