import winston from 'winston';
import fs from 'fs';
import path from 'path';

// Create logs directory
fs.mkdirSync('logs', { recursive: true });

// Generate timestamped filename for this session
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const sessionLogFile = path.join('logs', `session-${timestamp}.log`);

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

const logger = winston.createLogger({
  level: process.env.LOGLEVEL || 'info',
  format: customFormat,
  transports: [
    new winston.transports.File({ 
      filename: sessionLogFile,
      handleExceptions: true,
      handleRejections: true
    }),
  ],
});

// Console logging disabled - use log files only

// Log session start
logger.info('='.repeat(80));
logger.info(`New session started - Log file: ${sessionLogFile}`);
logger.info(`Log level: ${logger.level}`);
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info(`PID: ${process.pid}`);
logger.info('='.repeat(80));

export default logger;
