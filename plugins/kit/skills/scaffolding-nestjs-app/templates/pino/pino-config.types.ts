export interface AppLoggerOptions {
  level: string;
  pretty: boolean;
  singleLine: boolean;
  pinoConfigEnabled: boolean;
}

export interface AppLoggerContextFilter {
  blacklist: string[];
}

export interface PinoConfig {
  contextFilter?: AppLoggerContextFilter;
  redactPaths?: string[];
}

export function isContextFilter(value: unknown): value is AppLoggerContextFilter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blacklist' in value &&
    Array.isArray(value.blacklist) &&
    value.blacklist.every((context) => typeof context === 'string')
  );
}

export function isPinoConfig(value: unknown): value is PinoConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if ('contextFilter' in value && value.contextFilter !== undefined && !isContextFilter(value.contextFilter)) {
    return false;
  }

  if (
    'redactPaths' in value &&
    value.redactPaths !== undefined &&
    !(Array.isArray(value.redactPaths) && value.redactPaths.every((path) => typeof path === 'string'))
  ) {
    return false;
  }

  return true;
}
