import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiResponse } from '../types/api.types'; // TODO: точный относительный путь зависит от места файла

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    const method = request.method.toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    return next.handle().pipe(
      map((controllerResult: unknown) => {
        const explicitMessage: string | null = this.hasMessage(controllerResult) ? controllerResult.message : null;
        const explicitData = this.hasData(controllerResult) ? controllerResult.data : controllerResult;
        const finalMessage = explicitMessage ?? (isMutating ? this.getDefaultMessage(method) : null);

        return {
          success: true,
          message: finalMessage,
          data: explicitData || null,
          details: null,
        };
      }),
    );
  }

  private hasMessage(value: unknown): value is { message: string } {
    return typeof value === 'object' && value !== null && 'message' in value && typeof (value as { message: unknown }).message === 'string';
  }

  private hasData(value: unknown): value is { data: unknown } {
    return typeof value === 'object' && value !== null && 'data' in value;
  }

  private getDefaultMessage(method: string): string | null {
    switch (method) {
      case 'POST':
        return 'Успешно создано';
      case 'PUT':
      case 'PATCH':
        return 'Успешно обновлено';
      case 'DELETE':
        return 'Успешно удалено';
      default:
        return null;
    }
  }
}
