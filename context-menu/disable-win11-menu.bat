@echo off
:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo This will restore Windows 11's modern context menu
echo.
pause

:: Re-enable Windows 11 new context menu
reg delete "HKEY_CURRENT_USER\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" /f

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS! Windows 11 modern context menu restored.
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
