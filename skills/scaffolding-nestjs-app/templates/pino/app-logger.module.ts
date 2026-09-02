import { DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import { LoggerModule, type LoggerModuleAsyncParams } from 'nestjs-pino';
import { buildPinoParams } from './pino-config.helpers';
import { loadPinoConfig } from './pino-config.loader';
import type { AppLoggerOptions } from './pino-config.types';

export interface AppLoggerForRootAsyncOptions<TDeps extends readonly unknown[] = readonly unknown[]> {
  useFactory: (...args: [...TDeps]) => AppLoggerOptions | Promise<AppLoggerOptions>;
  inject: LoggerModuleAsyncParams['inject'];
  imports?: NonNullable<ModuleMetadata['imports']>;
}

@Module({})
export class AppLoggerModule {
  static forRoot(options: AppLoggerOptions): DynamicModule {
    return LoggerModule.forRoot(buildPinoParams(options, loadPinoConfig(options.pinoConfigEnabled)));
  }

  static forRootAsync<TDeps extends readonly unknown[]>(options: AppLoggerForRootAsyncOptions<TDeps>): DynamicModule {
    return LoggerModule.forRootAsync({
      imports: options.imports,
      inject: options.inject,
      useFactory: async (...args: TDeps) => {
        const appOpts = await options.useFactory(...args);
        return buildPinoParams(appOpts, loadPinoConfig(appOpts.pinoConfigEnabled));
      },
    });
  }
}
