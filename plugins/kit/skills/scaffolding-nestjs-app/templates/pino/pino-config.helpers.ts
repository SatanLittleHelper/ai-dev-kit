import type { Options } from 'pino-http';
import type { Params } from 'nestjs-pino';
import { REDACT_AUTH_HEADER_PATHS } from './pino-config.constants';
import type { AppLoggerOptions, PinoConfig } from './pino-config.types';

function isBlacklistedLogEntry(data: unknown, blacklist: string[]): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'context' in data &&
    typeof data.context === 'string' &&
    blacklist.includes(data.context)
  );
}

export function buildPinoParams(options: AppLoggerOptions, pinoConfig: PinoConfig | undefined): Params {
  const contextFilter = pinoConfig?.contextFilter;
  const redactPaths = [...REDACT_AUTH_HEADER_PATHS, ...(pinoConfig?.redactPaths ?? [])];

  const pinoHttp = {
    level: options.level,
    ...(contextFilter
      ? {
          hooks: {
            logMethod(this: unknown, inputArgs: unknown[], method: (...args: unknown[]) => void): void {
              const [data] = inputArgs;

              // Blacklist контекстов позволяет не засорять вывод служебными логами.
              if (isBlacklistedLogEntry(data, contextFilter.blacklist)) {
                return;
              }

              method.apply(this, inputArgs);
            },
          },
        }
      : {}),
    redact: { paths: redactPaths, remove: true },
    ...(options.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: options.singleLine,
              translateTime: 'SYS:standard',
            },
          },
        }
      : {}),
  } as unknown as Options;

  return { pinoHttp };
}
