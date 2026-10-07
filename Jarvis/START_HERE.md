# Jarvis: step-by-step setup (no experience needed)

## You need
1. **Python 3.10+**: https://www.python.org/downloads/ (Windows: tick **Add python.exe to PATH**).
2. **Google Chrome or Microsoft Edge** (needed for voice).
3. **An Anthropic API key**: https://console.anthropic.com -> *API keys* -> *Create key*. Add a few dollars of credit under *Billing*. Usage is pay-as-you-go; a normal chat costs a fraction of a cent.

## Install
1. Download the code: https://github.com/kwaggabeast8/projects/archive/refs/heads/claude/magical-edison-5dzamo.zip and unzip it.
2. Open the unzipped folder, then the **Jarvis** folder inside it.
3. **Windows:** double-click `install.bat`. **Mac/Linux:** open Terminal in that folder and run `bash install.sh`.
4. When asked, paste your API key and press Enter.

## Start
- **Windows:** double-click `Start Jarvis.bat`.  **Mac/Linux:** run `bash "Start Jarvis.command"`.
- Your browser opens the Jarvis HUD. Click **MIC**, allow the microphone, then say **"Jarvis, what time is it?"**
- Risky actions show an approval card. Click YES/NO or say "yes"/"no".
- Close the black window (or press Ctrl+C) to stop Jarvis.

## Troubleshooting
- *"Python is not installed"*: install it, tick Add to PATH, reopen the folder, run the installer again.
- *MIC does nothing / blocked*: use Chrome or Edge, click the lock icon in the address bar and allow the microphone.
- *"No API key found"*: open the `.env` file in Notepad and make sure it says `ANTHROPIC_API_KEY=sk-ant-...`
- *Credit/billing error*: add credit in the Anthropic console.
- *Mac: screen/keyboard control does nothing*: System Settings -> Privacy & Security -> allow your Terminal under Accessibility and Screen Recording.
