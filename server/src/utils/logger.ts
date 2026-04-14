import winston from 'winston';
import config from '../config/config';

const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.env === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...rest }) => {
            const extra = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${extra}`;
          })
        )
  ),
  // File transports are omitted — Vercel's filesystem is read-only.
  // Logs are captured from stdout/stderr by Vercel's log drain.
  transports: [
    new winston.transports.Console(),
  ],
});

export default logger;
