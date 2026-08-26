import { HttpException } from '@nestjs/common';

/** Test helper: asserts a rejection is an AppError with the given status and code. */
export async function expectAppError(promise: Promise<unknown>, status: number, code?: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  try {
    await promise;
  } catch (error) {
    const exception = error as HttpException;
    const body = exception.getResponse() as { code?: string };
    expect({ status: exception.getStatus(), code: body.code }).toEqual({
      status,
      ...(code ? { code } : { code: body.code }),
    });
  }
}
