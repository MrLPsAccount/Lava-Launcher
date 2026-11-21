@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
    echo Run Lava once through Python first to create .venv.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" -m pip install pyinstaller
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --windowed --onedir --name "Lava Launcher" --add-data "lava.html;." --add-data "assets;assets" --collect-all webview --collect-all minecraft_launcher_lib launcher.py
if errorlevel 1 goto :failed
echo.
echo Build finished: dist\Lava Launcher\Lava Launcher.exe
pause
exit /b 0
:failed
echo Build failed. Inspect the error above.
pause
exit /b 1
