import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ApiResponse } from '../types/api.types'; // TODO: точный относительный путь зависит от места файла

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(ApiExceptionFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    this.logger.error(exception, 'Необработанная ошибка запроса');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Неожиданная ошибка';
    let details = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        const body = res as { message: string };
        message = body.message || exception.message || message;
        details = body;
      }
    } else if (isAxiosError(exception)) {
      message = exception.message ?? message;
      if (exception.response) {
        const { status: responseStatus, data: responseData } = exception.response;
        status = responseStatus || HttpStatus.INTERNAL_SERVER_ERROR;
        if (typeof responseData === 'string') {
          message = responseData || message;
        }
        if (typeof responseData === 'object' && responseData !== null) {
          message = (responseData as { message?: string }).message ?? message;
          details = responseData;
        }
      }
    } else if (exception instanceof Error) {
      details = { error: exception.message };
    }

    const errorResponse: ApiResponse<null> = {
      success: false,
      message,
      data: null,
      details,
    };

    response.status(status).send(errorResponse);
  }
}
