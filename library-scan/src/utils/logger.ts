/** Log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Logger configuration */
interface LoggerConfig {
  debugEnabled: boolean;
}

class Logger {
  private config: LoggerConfig = {
    debugEnabled: false,
  };

  /** Enable or disable debug logging */
  setDebug(enabled: boolean): void {
    this.config.debugEnabled = enabled;
  }

  /** Check if debug is enabled */
  isDebugEnabled(): boolean {
    return this.config.debugEnabled;
  }

  /** Log debug message (only if debug enabled) */
  debug(message: string): void {
    if (this.config.debugEnabled) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  /** Log info message */
  info(message: string): void {
    console.log(message);
  }

  /** Log warning message */
  warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  /** Log error message */
  error(message: string): void {
    console.error(`ERROR: ${message}`);
  }

  /**
   * Log a curl command for an API request (debug only)
   * @param method HTTP method
   * @param url Request URL
   * @param headers Optional headers object
   * @param body Optional request body
   */
  logCurl(
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: unknown
  ): void {
    if (!this.config.debugEnabled) return;

    let curl = `curl -X ${method} '${url}'`;

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        curl += ` \\\n  -H '${key}: ${value}'`;
      }
    }

    if (body) {
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
      curl += ` \\\n  -d '${bodyStr}'`;
    }

    this.debug(`API Call:\n${curl}`);
  }
}

/** Global logger instance */
export const logger = new Logger();
