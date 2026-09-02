import { readFileSync } from 'fs';
import { join } from 'path';
import { PINO_CONFIG_FILENAME } from './pino-config.constants';
import { isPinoConfig, type PinoConfig } from './pino-config.types';

const readConfigFile = (configPath: string): string => {
  try {
    return readFileSync(configPath, 'utf-8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      throw new Error(`PINO_CONFIG_ENABLED=true, но файл ${PINO_CONFIG_FILENAME} не найден в ${process.cwd()}`);
    }

    throw err;
  }
};

const parseJsonConfig = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${PINO_CONFIG_FILENAME} должен содержать корректный JSON-объект`);
  }
};

export function loadPinoConfig(enabled: boolean): PinoConfig | undefined {
  if (!enabled) {
    return undefined;
  }

  const configPath = join(process.cwd(), PINO_CONFIG_FILENAME);
  const parsed = parseJsonConfig(readConfigFile(configPath));

  if (!isPinoConfig(parsed)) {
    throw new Error(
      `${PINO_CONFIG_FILENAME} должен иметь формат { contextFilter?: { blacklist: string[] }, redactPaths?: string[] }`,
    );
  }

  return parsed;
}
