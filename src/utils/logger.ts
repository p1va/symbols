import winston from 'winston';
import fs from 'fs';
import path from 'path';
import envPaths from 'env-paths';

// Unified logging system - starts with session logging, upgradeable to contextual
let currentLogger: winston.Logger;
let currentLogFile: string;

// Create custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack && typeof stack === 'string' ? `\n${stack}` : '';
    return `${String(timestamp)} [${String(level).toUpperCase().padEnd(5)}] ${String(message)}${metaStr}${stackStr}`;
  })
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
    console.error('Failed to create logs directory:', error);
    process.exit(1);
  }

  return winston.createLogger({
    level: process.env.LOGLEVEL || 'info',
    format: customFormat,
    transports: [
      new winston.transports.File({ 
        filename: logFilePath,
        handleExceptions: true,
        handleRejections: true
      }),
    ],
  });
}

/**
 * Initialize with basic session logging
 */
function initializeSessionLogger(): void {
  // Use env-paths for cross-platform log directory
  const paths = envPaths('symbols');
  const logDir = paths.log;
  
  // Generate timestamped filename for this session
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  currentLogFile = path.join(logDir, `session-${timestamp}.log`);
  
  try {
    currentLogger = createLogger(currentLogFile);
    
    // Log session start
    currentLogger.info('='.repeat(80));
    currentLogger.info(`Session started - Log file: ${currentLogFile}`);
    currentLogger.info(`Log level: ${currentLogger.level}`);
    currentLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    currentLogger.info(`PID: ${process.pid}`);
    currentLogger.info('='.repeat(80));
  } catch (error) {
    console.error('Failed to initialize session logger:', error);
    process.exit(1);
  }
}

/**
 * Upgrade to contextual logging with workspace + LSP info
 * Copies existing logs to the new file and switches logging target
 */
function upgradeToContextualLogger(workspacePath: string, lspName?: string): void {
  try {
    // Generate contextual log filename
    const paths = envPaths('symbols');
    const logDir = paths.log;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workspaceName = path.basename(workspacePath).replace(/[<>:"/\\|?*\s]/g, '-').substring(0, 50);
    
    const parts = [workspaceName];
    if (lspName) {
      parts.push(lspName.replace(/[<>:"/\\|?*\s]/g, '-').substring(0, 50));
    }
    parts.push(timestamp);
    
    const contextualLogFile = path.join(logDir, `${parts.join('_')}.log`);
    
    // Log the transition in the current logger
    currentLogger.info(`Upgrading to contextual logging: ${contextualLogFile}`);
    currentLogger.info(`Workspace: ${workspacePath}, LSP: ${lspName || 'auto-detect'}`);
    
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
    if (fs.existsSync(oldLogFile) && oldLogFile.includes('session-') && oldLogFile !== contextualLogFile) {
      try {
        fs.unlinkSync(oldLogFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    // If upgrade fails, continue with session logger
    currentLogger.error('Failed to upgrade to contextual logger', { error });
  }
}

// Initialize session logger on import
initializeSessionLogger();

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
  info: (message: string, meta?: object) => currentLogger.info(message, meta),
  warn: (message: string, meta?: object) => currentLogger.warn(message, meta),
  error: (message: string, meta?: object) => currentLogger.error(message, meta),
  debug: (message: string, meta?: object) => currentLogger.debug(message, meta),
  get level() { return currentLogger.level; },
  set level(newLevel: string) { currentLogger.level = newLevel; }
};

// Export upgrade function for use in main
export { upgradeToContextualLogger };
export default logger;
