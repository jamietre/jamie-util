@echo off
echo Reverting Windows 11 menu changes...
echo.

:: Re-enable Windows 11 new context menu
reg delete "HKEY_CURRENT_USER\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" /f 2>nul

echo Restarting Windows Explorer...
taskkill /f /im explorer.exe
start explorer.exe

echo.
echo Done! Windows 11 modern menu restored.
pause
