import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const TARGET_PATHS = {
  file: 'HKEY_CLASSES_ROOT\\*\\shell',
  folder: 'HKEY_CLASSES_ROOT\\Directory\\shell',
  background: 'HKEY_CLASSES_ROOT\\Directory\\Background\\shell'
};

/**
 * Escape command for registry
 */
function escapeRegCommand(cmd) {
  // Replace single backslashes with double backslashes for registry
  return cmd.replace(/\\/g, '\\\\');
}

/**
 * Add a context menu item
 */
export async function addMenuItem(options) {
  const { name, label, command, target = 'file', icon, position } = options;

  if (!TARGET_PATHS[target]) {
    throw new Error(`Invalid target: ${target}. Must be one of: file, folder, background`);
  }

  const basePath = TARGET_PATHS[target];
  const menuPath = `${basePath}\\${name}`;
  const commandPath = `${menuPath}\\command`;

  // Build registry file content
  let regContent = 'Windows Registry Editor Version 5.00\n\n';

  // Add menu item key with label
  regContent += `[${menuPath}]\n`;
  regContent += `@="${label}"\n`;

  if (position) {
    regContent += `"Position"="${position}"\n`;
  }

  if (icon) {
    const iconPath = path.resolve(icon).replace(/\\/g, '\\\\');
    regContent += `"Icon"="${iconPath}"\n`;
  }

  regContent += '\n';

  // Add command key
  regContent += `[${commandPath}]\n`;

  // Prepare the command with parameter placeholder
  let fullCommand = command;
  if (target === 'background') {
    // For background, use %V (selected folder path)
    if (!fullCommand.includes('%')) {
      fullCommand = `${command} "%V"`;
    }
  } else {
    // For files/folders, use %1 (selected item path)
    if (!fullCommand.includes('%')) {
      fullCommand = `${command} "%1"`;
    }
  }

  regContent += `@="${escapeRegCommand(fullCommand)}"\n`;

  // Write to temporary .reg file
  const tempFile = path.join(process.cwd(), `temp_${name}.reg`);
  const fs = await import('fs/promises');
  await fs.writeFile(tempFile, regContent, 'utf8');

  try {
    // Import the registry file
    await execAsync(`reg import "${tempFile}"`);

    // Clean up temp file
    await fs.unlink(tempFile);
  } catch (error) {
    // Try to clean up temp file even on error
    try {
      await fs.unlink(tempFile);
    } catch {}
    throw new Error(`Failed to add menu item: ${error.message}`);
  }
}

/**
 * Remove a context menu item
 */
export async function removeMenuItem(options) {
  const { name, target = 'file' } = options;

  if (!TARGET_PATHS[target]) {
    throw new Error(`Invalid target: ${target}. Must be one of: file, folder, background`);
  }

  const basePath = TARGET_PATHS[target];
  const menuPath = `${basePath}\\${name}`;

  try {
    // Delete the registry key
    await execAsync(`reg delete "${menuPath}" /f`);
  } catch (error) {
    // Check if the key doesn't exist
    if (error.message.includes('unable to find')) {
      throw new Error(`Menu item '${name}' not found in ${target} context`);
    }
    throw new Error(`Failed to remove menu item: ${error.message}`);
  }
}

/**
 * List all context menu items
 */
export async function listMenuItems(options) {
  const { target = 'all' } = options;
  const items = [];

  const targetsToQuery = target === 'all'
    ? Object.keys(TARGET_PATHS)
    : [target];

  for (const targetType of targetsToQuery) {
    if (!TARGET_PATHS[targetType]) continue;

    const basePath = TARGET_PATHS[targetType];

    try {
      // Query the registry path
      const { stdout } = await execAsync(`reg query "${basePath}"`);

      // Parse the output to get subkeys
      const lines = stdout.split('\n');
      const subkeys = lines
        .filter(line => line.trim().startsWith('HKEY_'))
        .map(line => line.trim().split('\\').pop());

      // For each subkey, get details
      for (const subkey of subkeys) {
        try {
          const menuPath = `${basePath}\\${subkey}`;
          const commandPath = `${menuPath}\\command`;

          // Get label
          const { stdout: labelOut } = await execAsync(`reg query "${menuPath}" /ve`);
          const labelMatch = labelOut.match(/REG_SZ\s+(.+)/);
          const label = labelMatch ? labelMatch[1].trim() : subkey;

          // Get command
          const { stdout: cmdOut } = await execAsync(`reg query "${commandPath}" /ve`);
          const cmdMatch = cmdOut.match(/REG_SZ\s+(.+)/);
          const command = cmdMatch ? cmdMatch[1].trim() : 'N/A';

          // Try to get icon
          let icon = null;
          try {
            const { stdout: iconOut } = await execAsync(`reg query "${menuPath}" /v Icon`);
            const iconMatch = iconOut.match(/Icon\s+REG_SZ\s+(.+)/);
            icon = iconMatch ? iconMatch[1].trim() : null;
          } catch {}

          items.push({
            name: subkey,
            target: targetType,
            label,
            command,
            icon
          });
        } catch {
          // Skip items we can't read
        }
      }
    } catch {
      // Path doesn't exist or can't be read
    }
  }

  return items;
}
