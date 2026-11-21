@echo off
setlocal
cd /d "%~dp0"
set "PY=python"
where python >nul 2>&1
if errorlevel 1 (
    set "PY=py -3"
    where py >nul 2>&1
    if errorlevel 1 (
        echo Python was not found. Install Python 3.11 or newer and reopen this folder.
        echo You can check by opening Command Prompt and typing: python --version
        pause
        exit /b 1
    )
)
if not exist ".venv\Scripts\python.exe" (
    echo Creating Lava Python environment...
    %PY% -m venv .venv
    if errorlevel 1 goto :failed
)
echo Installing/checking Lava dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed
echo Starting Lava Desktop...
".venv\Scripts\python.exe" launcher.py
if errorlevel 1 goto :failed
exit /b 0
:failed
echo.
echo Lava could not start. Check the error message above.
pause
exit /b 1
