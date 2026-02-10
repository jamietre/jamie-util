import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private debugEnabled = false;

  enableDebug(): void {
    this.debugEnabled = true;
  }

  disableDebug(): void {
    this.debugEnabled = false;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    console.log(chalk.blue(`[INFO] ${message}`), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(chalk.yellow(`[WARN] ${message}`), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red(`[ERROR] ${message}`), ...args);
  }

  success(message: string, ...args: unknown[]): void {
    console.log(chalk.green(`[SUCCESS] ${message}`), ...args);
  }
}

export const logger = new Logger();
