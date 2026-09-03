import pino, { type Logger, type LoggerOptions } from 'pino';
import { config } from '../config/index.ts';

/**
 * Membuat instance Pino base logger dengan konfigurasi sesuai environment.
 * Pada mode development: menggunakan transport pino-pretty dengan output berwarna.
 * Pada mode production: menggunakan format structured JSON untuk performa optimal dan log aggregators.
 */
const createBaseLogger = (): Logger => {
  const isDev = config.app.env === 'development';
  const logLevel = Bun.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

  const options: LoggerOptions = {
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (isDev) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    });
  }

  return pino(options);
};

export const baseLogger: Logger = createBaseLogger();
