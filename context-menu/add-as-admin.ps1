# Helper script to run context-menu commands with admin privileges
param(
    [Parameter(Mandatory=$true)]
    [string]$Command
)

if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires administrator privileges. Relaunching as admin..." -ForegroundColor Yellow
    $arguments = "-NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Command `"$Command`""
    Start-Process powershell -Verb RunAs -ArgumentList $arguments
    exit
}

# Run the command
Write-Host "Running: context-menu $Command" -ForegroundColor Cyan
Invoke-Expression "context-menu $Command"

Write-Host "`nPress any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
