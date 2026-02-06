@echo off
:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Removing "Create .priority file" context menu item...
echo.

:: Remove from folder context menu
reg delete "HKEY_CLASSES_ROOT\Directory\shell\CreatePriority" /f 2>nul

:: Remove from background context menu
reg delete "HKEY_CLASSES_ROOT\Directory\Background\shell\CreatePriority" /f 2>nul

echo.
echo SUCCESS! Context menu items removed.
echo.

pause
