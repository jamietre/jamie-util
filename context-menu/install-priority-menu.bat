@echo off
:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Installing "Create .priority file" context menu item...
echo.

:: Add to folder context menu (right-click ON a folder)
reg add "HKEY_CLASSES_ROOT\Directory\shell\CreatePriority" /ve /d "Create .priority file" /f
reg add "HKEY_CLASSES_ROOT\Directory\shell\CreatePriority" /v "Position" /d "Top" /f
reg add "HKEY_CLASSES_ROOT\Directory\shell\CreatePriority\command" /ve /d "powershell -ExecutionPolicy Bypass -File \"C:\code\jamie-util\context-menu\scripts\create-priority-file.ps1\" \"%%1\"" /f

:: Also add to background menu (right-click IN a folder)
reg add "HKEY_CLASSES_ROOT\Directory\Background\shell\CreatePriority" /ve /d "Create .priority file" /f
reg add "HKEY_CLASSES_ROOT\Directory\Background\shell\CreatePriority" /v "Position" /d "Top" /f
reg add "HKEY_CLASSES_ROOT\Directory\Background\shell\CreatePriority\command" /ve /d "powershell -ExecutionPolicy Bypass -File \"C:\code\jamie-util\context-menu\scripts\create-priority-file.ps1\" \"%%V\"" /f

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS! Context menu item installed.
    echo.
    echo WINDOWS 11 NOTE:
    echo - Items will appear in "Show more options" menu by default
    echo - Run "enable-win11-menu.bat" to show items in the modern menu
    echo.
) else (
    echo.
    echo ERROR: Failed to install context menu item.
    echo.
)

pause
