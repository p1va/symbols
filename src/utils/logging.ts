/**
 * Enhanced logging system using env-paths for cross-platform log directories
 * and structured file naming for workspace + LSP identification
 */

import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { getAppPaths } from './app-paths.js';

/**
 * Sanitize a string to be filesystem-safe
 */
function sanitizeForFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid chars with dash
    .replace(/\s+/g, '-') // Replace spaces with dash
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, '') // Remove leading/trailing dashes
    .substring(0, 50); // Limit length
}

/**
 * Generate log file name with workspace + LSP context
 */
export function generateLogFileName(
  workspacePath: string,
  lspName?: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Extract workspace name from path
  const workspaceName = sanitizeForFilename(path.basename(workspacePath));

  // Build filename components
  const parts = [workspaceName];
  if (lspName) {
    parts.push(sanitizeForFilename(lspName));
  }
  parts.push(timestamp);

  return `${parts.join('_')}.log`;
}

/**
 * Get the standardized log directory using env-paths
 */
export function getLogDirectory(): string {
  const paths = getAppPaths();
  return paths.log;
}

/**
 * Create and return a configured logger for a specific workspace + LSP combo
 */
export function createContextualLogger(
  workspacePath: string,
  lspName?: string
): winston.Logger {
  const logDir = getLogDirectory();
  const logFileName = generateLogFileName(workspacePath, lspName);
  const logFilePath = path.join(logDir, logFileName);

  // Ensure log directory exists
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create log directory:', error);
    process.exit(1);
  }

  // Create custom format for better readability
  const customFormat = winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS',
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const metaStr =
        Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      const stackStr = stack && typeof stack === 'string' ? `\n${stack}` : '';
      return `${String(timestamp)} [${String(level).toUpperCase().padEnd(5)}] ${String(message)}${metaStr}${stackStr}`;
    })
  );

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

  // Log session start with context information
  try {
    logger.debug('='.repeat(80));
    logger.debug(`New session started - Log file: ${logFilePath}`);
    logger.debug(`Workspace: ${workspacePath}`);
    logger.debug(`LSP: ${lspName || 'auto-detect'}`);
    logger.debug(`Log level: ${logger.level}`);
    logger.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.debug(`PID: ${process.pid}`);
    logger.debug('='.repeat(80));
  } catch (error) {
    console.error('Failed to write initial log entries:', error);
    // Don't exit here - let the process continue but warn about logging issues
  }

  return logger;
}

/**
 * Backward compatibility: create logger with legacy behavior
 */
export function createLegacyLogger(): winston.Logger {
  // Create logs directory in current working directory
  try {
    fs.mkdirSync('logs', { recursive: true });
  } catch (error) {
    console.error('Failed to create logs directory:', error);
    process.exit(1);
  }

  // Generate timestamped filename for this session
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionLogFile = path.join('logs', `session-${timestamp}.log`);

  // Create custom format for better readability
  const customFormat = winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS',
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const metaStr =
        Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      const stackStr = stack && typeof stack === 'string' ? `\n${stack}` : '';
      return `${String(timestamp)} [${String(level).toUpperCase().padEnd(5)}] ${String(message)}${metaStr}${stackStr}`;
    })
  );

  const logger = winston.createLogger({
    level: process.env.LOGLEVEL || 'info',
    format: customFormat,
    transports: [
      new winston.transports.File({
        filename: sessionLogFile,
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
  });

  // Log session start with error handling
  try {
    logger.debug('='.repeat(80));
    logger.debug(`New session started - Log file: ${sessionLogFile}`);
    logger.debug(`Log level: ${logger.level}`);
    logger.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.debug(`PID: ${process.pid}`);
    logger.debug('='.repeat(80));
  } catch (error) {
    console.error('Failed to write initial log entries:', error);
    // Don't exit here - let the process continue but warn about logging issues
  }

  return logger;
}
