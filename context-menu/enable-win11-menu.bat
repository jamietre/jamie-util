@echo off
:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo This will make Windows 11 show the full context menu by default
echo (no need to click "Show more options")
echo.
echo Your custom menu items will then appear immediately.
echo.
pause

:: Disable Windows 11 new context menu, revert to Windows 10 style
reg add "HKEY_CURRENT_USER\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32" /ve /f

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS! Windows 11 modern context menu disabled.
    echo.
    echo IMPORTANT: You must restart Windows Explorer for this to take effect.
    echo.
    choice /C YN /M "Restart Windows Explorer now?"
    if errorlevel 2 goto :skip
    if errorlevel 1 goto :restart

    :restart
    echo Restarting Windows Explorer...
    taskkill /f /im explorer.exe
    start explorer.exe
    echo Done!
    goto :end

    :skip
    echo.
    echo Please restart Windows Explorer manually or log out/in.

    :end
) else (
    echo.
    echo ERROR: Failed to modify registry.
    echo.
)

echo.
pause
