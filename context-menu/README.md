# Context Menu Manager

A CLI tool for easily managing Windows Explorer context menu items.

## Installation

```bash
npm install
npm link
```

## Usage

### Add a context menu item

```bash
context-menu add -n <name> -l <label> -c <command> [-t <target>] [-i <icon>]
```

Options:
- `-n, --name <name>`: Registry key name (unique identifier)
- `-l, --label <label>`: Display label shown in the context menu
- `-c, --command <command>`: Command to execute (can include placeholders)
- `-t, --target <target>`: Target context - `file`, `folder`, or `background` (default: `file`)
- `-i, --icon <icon>`: Optional path to icon file
- `-p, --position <position>`: Menu position - `Top`, `Bottom`, or omit for alphabetical

**Placeholders:**
- `%1` - Selected file/folder path (automatically added if not present)
- `%V` - Selected folder path for background context (automatically added if not present)

### Remove a context menu item

```bash
context-menu remove -n <name> [-t <target>]
```

### List all context menu items

```bash
context-menu list [-t <target>]
```

Target can be: `file`, `folder`, `background`, or `all` (default: `all`)

## Examples

### Create .priority file

**Easy way:** Just double-click `install-priority-menu.bat`

**CLI way:**
```bash
context-menu add -n CreatePriority -l "Create .priority file" -c "powershell -ExecutionPolicy Bypass -File C:\\code\\jamie-util\\context-menu\\scripts\\create-priority-file.ps1" -t folder
```

Then right-click on any folder to see "Create .priority file" option.

### Open with VSCode

```bash
context-menu add -n OpenWithVSCode -l "Open with VSCode" -c "code" -t file
```

### Open PowerShell here

```bash
context-menu add -n PowerShellHere -l "Open PowerShell here" -c "powershell -NoExit -Command Set-Location" -t folder -p Top
```

## Menu Position Control

You can control where your items appear in the context menu:

- `-p Top` - Appears at the top of the menu
- `-p Bottom` - Appears at the bottom of the menu
- No position flag - Appears alphabetically

**Note:** Position values:
- `Top` - Very top of the menu
- `Bottom` - Very bottom
- You can also use specific separators like `Middle` (between built-in groups)

## How it works

This tool manipulates the Windows Registry to add/remove context menu items:

- **Files**: `HKEY_CLASSES_ROOT\*\shell`
- **Folders**: `HKEY_CLASSES_ROOT\Directory\shell`
- **Background**: `HKEY_CLASSES_ROOT\Directory\Background\shell`

## Quick Install Scripts

For the `.priority` file menu item:
- `install-priority-menu.bat` - Install the menu item (for folders)
- `uninstall-priority-menu.bat` - Remove the menu item

For Windows 11 users:
- `enable-win11-menu.bat` - Show full menu immediately (no "Show more options")
- `disable-win11-menu.bat` - Restore Windows 11 modern menu

## Windows 11 Context Menu

By default, custom items appear in the legacy menu (click "Show more options").

**To show your items in the modern Windows 11 menu:**
1. Run `enable-win11-menu.bat`
2. Restart Windows Explorer (script will offer to do this)

This disables the new Windows 11 context menu and shows the full classic menu immediately.

## Requirements

- Windows OS
- Node.js
- Administrator privileges (for registry modifications)

## Notes

- Changes take effect immediately (no restart required)
- You may need to refresh Explorer (F5) to see new items
- Run the CLI with administrator privileges if you encounter permission errors
