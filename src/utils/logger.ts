import winston from 'winston';
import fs from 'fs';
import path from 'path';
import envPaths from 'env-paths';

// Unified logging system - starts with session logging, upgradeable to contextual
let currentLogger: winston.Logger | null = null;
let currentLogFile: string = 'uninitialized';

// Create custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
  //winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
  //  const metaStr =
  //    Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  //  const stackStr = stack && typeof stack === 'string' ? `\n${stack}` : '';
  //  return `${String(timestamp)} [${String(level).toUpperCase().padEnd(5)}] ${String(message)}${metaStr}${stackStr}`;
  //})
);

/**
 * Create a logger for the given log file path
 */
function createLogger(logFilePath: string): winston.Logger {
  // Ensure directory exists
  const logDir = path.dirname(logFilePath);

  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    process.stderr.write(
      `[INIT] Failed to create logs directory: ${error instanceof Error ? error.message : String(error)}\n`
    );
    throw error;
  }

  try {
    const logger = winston.createLogger({
      level: process.env.LOGLEVEL || 'info',
      format: customFormat,
      transports: [
        new winston.transports.File({
          filename: logFilePath,
          handleExceptions: true,
          handleRejections: true,
        }),
      ],
    });
    return logger;
  } catch (error) {
    process.stderr.write(
      `[INIT] Failed to create winston logger: ${error instanceof Error ? error.message : String(error)}\n`
    );
    throw error;
  }
}

/**
 * Initialize with basic session logging
 */
function initializeSessionLogger(): void {
  try {
    // Use env-paths for cross-platform log directory
    const logDir = envPaths('symbols').log;

    // Generate timestamped filename for this session
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    currentLogFile = path.join(logDir, `session-${timestamp}.log`);

    currentLogger = createLogger(currentLogFile);

    // Log session start
    currentLogger.info('='.repeat(80));
    currentLogger.info(`Session started - Log file: ${currentLogFile}`);
    currentLogger.info(`Log level: ${currentLogger.level}`);
    currentLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    currentLogger.info(`PID: ${process.pid}`);
    currentLogger.info('='.repeat(80));
  } catch (error) {
    process.stderr.write(
      `[INIT] Failed to initialize session logger: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

/**
 * Safe wrapper that handles uninitialized logger
 */
function ensureInitialized(): winston.Logger {
  if (!currentLogger) {
    process.stderr.write(
      `[WARN] Logger used before initialization, auto-initializing...\n`
    );
    initializeSessionLogger();
  }
  return currentLogger!;
}

/**
 * Upgrade to contextual logging with workspace + LSP info
 * Copies existing logs to the new file and switches logging target
 */
function upgradeToContextualLogger(
  workspacePath: string,
  lspName?: string
): void {
  try {
    // Generate contextual log filename
    const logDir = envPaths('symbols').log;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Find workspace name from path
    const workspaceName = path
      .basename(workspacePath)
      .replace(/[<>:"/\\|?*\s]/g, '-')
      .substring(0, 50);

    const parts = [workspaceName];
    if (lspName) {
      parts.push(lspName.replace(/[<>:"/\\|?*\s]/g, '-').substring(0, 50));
    }
    parts.push(timestamp);

    const contextualLogFile = path.join(logDir, `${parts.join('_')}.log`);

    // Log the transition in the current logger (ensure it's initialized)
    const logger = ensureInitialized();
    logger.info(`Moving to LSP-specific logging: ${contextualLogFile}`);
    logger.info(
      `Workspace: ${workspacePath}, LSP: ${lspName || 'auto-detect'}`
    );

    // Read existing logs if the session log exists and is different
    let existingContent = '';
    if (currentLogFile !== contextualLogFile && fs.existsSync(currentLogFile)) {
      existingContent = fs.readFileSync(currentLogFile, 'utf8');
    }

    // Create new contextual logger
    const newLogger = createLogger(contextualLogFile);

    // Write existing content to new file if we have any
    if (existingContent) {
      fs.appendFileSync(contextualLogFile, existingContent);
    }

    // Add transition marker in new file
    newLogger.info('='.repeat(80));
    newLogger.info('TRANSITIONED TO CONTEXTUAL LOGGING');
    newLogger.info(`Workspace: ${workspacePath}`);
    newLogger.info(`LSP: ${lspName || 'auto-detect'}`);
    newLogger.info('='.repeat(80));

    // Save old session file path before switching
    const oldLogFile = currentLogFile;

    // Switch to new logger
    currentLogger = newLogger;
    currentLogFile = contextualLogFile;

    // Clean up old session file if it's different
    if (
      fs.existsSync(oldLogFile) &&
      oldLogFile.includes('session-') &&
      oldLogFile !== contextualLogFile
    ) {
      try {
        fs.unlinkSync(oldLogFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    // If upgrade fails, continue with session logger
    ensureInitialized().error('Failed to upgrade to contextual logger', {
      error,
    });
  }
}

/**
 * Initialize the logger system - must be called before using logger
 */
export function initLogger(): void {
  initializeSessionLogger();
}

// No automatic initialization - must call initLogger() explicitly

// Create a logger interface that maintains winston compatibility
interface UnifiedLogger {
  info(message: string): winston.Logger;
  info(message: string, meta: object): winston.Logger;
  warn(message: string): winston.Logger;
  warn(message: string, meta: object): winston.Logger;
  error(message: string): winston.Logger;
  error(message: string, meta: object): winston.Logger;
  debug(message: string): winston.Logger;
  debug(message: string, meta: object): winston.Logger;
  level: string;
}

// Export unified logger interface that proxies to the current logger
const logger: UnifiedLogger = {
  info: (message: string, meta?: object) =>
    ensureInitialized().info(message, meta),
  warn: (message: string, meta?: object) =>
    ensureInitialized().warn(message, meta),
  error: (message: string, meta?: object) => {
    // Always output errors to stderr as well for visibility
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    process.stderr.write(`[ERROR] ${message}${metaStr}\n`);
    return ensureInitialized().error(message, meta);
  },
  debug: (message: string, meta?: object) =>
    ensureInitialized().debug(message, meta),
  get level() {
    return ensureInitialized().level;
  },
  set level(newLevel: string) {
    ensureInitialized().level = newLevel;
  },
};

// Export upgrade function for use in main
export { upgradeToContextualLogger };
export default logger;
