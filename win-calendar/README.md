# Meeting Reminder (.NET)

A Windows desktop app for persistent Outlook meeting reminders with toast notifications.

## Features

- System tray icon with context menu
- Toast notifications that stay until dismissed
- Multiple reminder stages (15 min, 5 min, 1 min before, at start, overdue)
- Screen flash for overdue meetings
- Join button for Zoom/Teams/Meet meetings
- Snooze, Remind at start, Dismiss actions
- Reads calendar data from Outlook VBA export

## Requirements

- Windows 10 (build 17763+) / Windows 11
- .NET 8.0 Runtime
- Outlook VBA macro running (same as PowerShell version)

## Building

```bash
dotnet build
```

## Publishing

Create a single executable:

```bash
dotnet publish -c Release -r win-x64 --self-contained false
```

Output will be in `bin/Release/net8.0-windows10.0.19041.0/win-x64/publish/WinCalendar.exe`

## Installation

### 1. Set up the Outlook VBA macro

1. Open Outlook
2. Press `Alt+F11` to open VBA Editor
3. Insert → Module (creates a new standard module)
4. Copy contents of `CalendarExportModule.bas` into the module
5. Close VBA Editor
6. Press `Alt+F8` → Run `StartCalendarExport`

The macro exports calendar data every 30 seconds to `~/.outlook-automation/calendar-data.json`.

### 2. Build and install the app

1. Build or download `MeetingReminder.exe`
2. Add to Windows startup:
   - Press `Win+R`, type `shell:startup`
   - Create shortcut to `MeetingReminder.exe`

## Tray Menu Options

- **Check Now** - Immediately check for upcoming meetings
- **Clear Notifications** - Clear all notification history
- **Reset Reminders** - Reset state for upcoming meetings (re-enables dismissed reminders)
- **Open Data Folder** - Open ~/.outlook-automation folder
- **Show Meetings Today** - Display all meetings for today with Join/Open in Outlook links
- **Show Meetings Tomorrow** - Display all meetings for tomorrow
- **Exit** - Close the application

## Data Files

Uses the same data folder as the PowerShell version (`~/.outlook-automation/`):

- `calendar-data.json` - Calendar export from Outlook VBA
- `reminder-state-dotnet.json` - State tracking (separate from PowerShell version)
- `dotnet-app.log` - Application log

## Differences from PowerShell Version

- Single `.exe` file, no dependencies
- Native Windows notification APIs (no BurntToast module)
- Runs hidden by default (no console window)
- No module state issues or periodic resets needed
- Separate state file to avoid conflicts during migration
