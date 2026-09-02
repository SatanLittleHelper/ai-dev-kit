import { DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import { LoggerModule, type LoggerModuleAsyncParams, Params } from 'nestjs-pino';
import type { Options } from 'pino-http';

export type AppLoggerOptions = {
  level: string;
  pretty: boolean;
};

export type AppLoggerForRootAsyncOptions<TDeps extends readonly unknown[] = readonly unknown[]> = {
  useFactory: (...args: [...TDeps]) => AppLoggerOptions | Promise<AppLoggerOptions>;
  inject: LoggerModuleAsyncParams['inject'];
  imports?: NonNullable<ModuleMetadata['imports']>;
};

const REDACT_AUTH_HEADER_PATHS: string[] = ['req.headers.authorization', 'req.headers.x-auth-token'];

function buildPinoParams(options: AppLoggerOptions): Params {
  const pinoHttp = {
    level: options.level,
    redact: { paths: REDACT_AUTH_HEADER_PATHS, remove: true },
    ...(options.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
            },
          },
        }
      : {}),
  } as unknown as Options;

  return { pinoHttp };
}

@Module({})
export class AppLoggerModule {
  static forRoot(options: AppLoggerOptions): DynamicModule {
    return LoggerModule.forRoot(buildPinoParams(options));
  }

  static forRootAsync<TDeps extends readonly unknown[]>(options: AppLoggerForRootAsyncOptions<TDeps>): DynamicModule {
    return LoggerModule.forRootAsync({
      imports: options.imports,
      inject: options.inject,
      useFactory: async (...args: TDeps) => {
        const appOpts = await options.useFactory(...args);
        return buildPinoParams(appOpts);
      },
    });
  }
}
