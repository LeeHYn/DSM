import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type NormalizedExceptionResponse = {
  error: string;
  message: string | string[] | Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeExceptionResponse(response: string | object): NormalizedExceptionResponse {
  if (typeof response === 'string') {
    return {
      error: response,
      message: response,
    };
  }

  if (isRecord(response)) {
    const error = typeof response.error === 'string' ? response.error : 'Error';
    const message =
      typeof response.message === 'string' ||
      Array.isArray(response.message) ||
      isRecord(response.message)
        ? response.message
        : error;

    return {
      error,
      message,
    };
  }

  return {
    error: 'Error',
    message: 'Internal server error',
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const normalized = normalizeExceptionResponse(exceptionResponse);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: normalized.error,
      message: normalized.message,
    });
  }
}
