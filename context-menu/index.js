#!/usr/bin/env node

import { program } from 'commander';
import { addMenuItem, removeMenuItem, listMenuItems } from './lib/registry.js';

program
  .name('context-menu')
  .description('CLI tool for managing Windows Explorer context menu items')
  .version('1.0.0');

program
  .command('add')
  .description('Add a context menu item')
  .requiredOption('-n, --name <name>', 'Menu item name (registry key)')
  .requiredOption('-l, --label <label>', 'Display label for the menu item')
  .requiredOption('-c, --command <command>', 'Command to execute')
  .option('-t, --target <target>', 'Target context: file, folder, background', 'file')
  .option('-i, --icon <icon>', 'Path to icon file')
  .option('-p, --position <position>', 'Menu position: Top, Bottom, or leave empty for default')
  .action(async (options) => {
    try {
      await addMenuItem(options);
      console.log(`✓ Successfully added menu item: ${options.label}`);
    } catch (error) {
      console.error(`✗ Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Remove a context menu item')
  .requiredOption('-n, --name <name>', 'Menu item name (registry key)')
  .option('-t, --target <target>', 'Target context: file, folder, background', 'file')
  .action(async (options) => {
    try {
      await removeMenuItem(options);
      console.log(`✓ Successfully removed menu item: ${options.name}`);
    } catch (error) {
      console.error(`✗ Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all custom context menu items')
  .option('-t, --target <target>', 'Target context: file, folder, background, all', 'all')
  .action(async (options) => {
    try {
      const items = await listMenuItems(options);
      if (items.length === 0) {
        console.log('No custom context menu items found.');
      } else {
        console.log('\nCustom Context Menu Items:');
        console.log('─'.repeat(60));
        items.forEach(item => {
          console.log(`\nName: ${item.name}`);
          console.log(`Target: ${item.target}`);
          console.log(`Label: ${item.label}`);
          console.log(`Command: ${item.command}`);
          if (item.icon) console.log(`Icon: ${item.icon}`);
        });
        console.log('─'.repeat(60));
      }
    } catch (error) {
      console.error(`✗ Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
