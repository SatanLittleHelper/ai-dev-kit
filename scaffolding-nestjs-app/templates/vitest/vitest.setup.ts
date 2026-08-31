import { Logger } from '@nestjs/common';

Logger.prototype.log = (): void => undefined;
Logger.prototype.error = (): void => undefined;
Logger.prototype.warn = (): void => undefined;
Logger.prototype.debug = (): void => undefined;
Logger.prototype.verbose = (): void => undefined;
