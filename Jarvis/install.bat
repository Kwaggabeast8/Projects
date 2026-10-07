@echo off
cd /d "%~dp0"
set PY=
py -3 --version >nul 2>&1 && set PY=py -3
if "%PY%"=="" python --version >nul 2>&1 && set PY=python
if "%PY%"=="" (
  echo Python is not installed. Install it from https://www.python.org/downloads/
  echo IMPORTANT: tick "Add python.exe to PATH" in the installer, then run install.bat again.
  pause & exit /b 1
)
%PY% -m venv .venv || (echo Could not create the environment. & pause & exit /b 1)
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\pip install -r requirements.txt || (echo Install failed. & pause & exit /b 1)
findstr /b /c:"ANTHROPIC_API_KEY=" .env >nul 2>&1 || (
  echo.
  echo Get an API key at https://console.anthropic.com  ^(API keys, Create key; add a few dollars of credit^)
  set /p KEY=Paste your API key here and press Enter: 
  > .env echo ANTHROPIC_API_KEY=%KEY%
)
echo.
echo Installed. To start Jarvis, double-click "Start Jarvis.bat".
pause
