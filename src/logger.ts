import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { PATHS } from './constants.js';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export class Logger {
  private static instance: Logger;
  private logFilePath: string;
  private debugEnabled: boolean;

  private constructor() {
    const date = new Date().toISOString().split('T')[0];
    this.logFilePath = `${PATHS.LOGS_DIR}/swarm-${date}.log`;
    this.debugEnabled = process.env.SWARM_DEBUG === '1';

    if (!existsSync(PATHS.LOGS_DIR)) {
      mkdirSync(PATHS.LOGS_DIR, { recursive: true });
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: LogLevel, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (context) {
      logMessage += ` ${JSON.stringify(context)}`;
    }
    
    return logMessage;
  }

  private writeLog(level: LogLevel, message: string, context?: any): void {
    const formattedMessage = this.formatMessage(level, message, context);
    
    if (level === LogLevel.DEBUG && !this.debugEnabled) {
      return;
    }

    if (level === LogLevel.ERROR || level === LogLevel.WARN) {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    try {
      appendFileSync(this.logFilePath, formattedMessage + '\n', 'utf8');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  debug(message: string, context?: any): void {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: any): void {
    this.writeLog(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: any): void {
    this.writeLog(LogLevel.WARN, message, context);
  }

  error(message: string, context?: any): void {
    this.writeLog(LogLevel.ERROR, message, context);
  }
}

export const logger = Logger.getInstance();
