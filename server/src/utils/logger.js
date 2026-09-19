import pino from 'pino';
import { config } from '../config.js';

const transport = config.nodeEnv !== 'production'
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
  : undefined;

export const logger = pino({
  level: config.logLevel,
  transport,
  base: { service: 'arcx' },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.ip,
    }),
  },
});
