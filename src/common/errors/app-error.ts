import { HttpException, HttpStatus } from '@nestjs/common';
export type ErrorParams = Record<string, string | number>;
export class AppError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, params?: ErrorParams) { super({ statusCode: status, code, message, ...(params ? { params } : {}) }, status); }
  static badRequest(code: string, message: string, params?: ErrorParams) { return new AppError(HttpStatus.BAD_REQUEST, code, message, params); }
  static paymentRequired(code: string, message: string, params?: ErrorParams) { return new AppError(HttpStatus.PAYMENT_REQUIRED, code, message, params); }
  static notFound(code: string, message: string, params?: ErrorParams) { return new AppError(HttpStatus.NOT_FOUND, code, message, params); }
  static conflict(code: string, message: string, params?: ErrorParams) { return new AppError(HttpStatus.CONFLICT, code, message, params); }
  static unauthorized(code: string, message: string) { return new AppError(HttpStatus.UNAUTHORIZED, code, message); }
  static forbidden(code: string, message: string) { return new AppError(HttpStatus.FORBIDDEN, code, message); }
  static tooManyRequests(code: string, message: string) { return new AppError(HttpStatus.TOO_MANY_REQUESTS, code, message); }
  static serviceUnavailable(code: string, message: string) { return new AppError(HttpStatus.SERVICE_UNAVAILABLE, code, message); }
  static badGateway(code: string, message: string) { return new AppError(HttpStatus.BAD_GATEWAY, code, message); }
}
