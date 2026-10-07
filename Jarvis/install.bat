@echo off
cd /d "%~dp0"
python -m venv .venv || (echo Please install Python 3.10+ first & exit /b 1)
.venv\Scripts\pip install -r requirements.txt
if not exist .env (
  set /p KEY=Paste your Anthropic API key: 
  > .env echo ANTHROPIC_API_KEY=%KEY%
)
> jarvis.bat echo @echo off
>> jarvis.bat echo cd /d "%%~dp0"
>> jarvis.bat echo for /f "usebackq tokens=1,* delims==" %%%%a in (".env") do set "%%%%a=%%%%b"
>> jarvis.bat echo .venv\Scripts\python jarvis.py %%*
echo.
echo Done. Start Jarvis with:  jarvis.bat --voice
