import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Validates request input against a zod schema; failures name the fields, not the values. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(
    private readonly schema: T,
    private readonly message = 'Request body is invalid',
  ) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: this.message,
      details: { fields },
    });
  }
}
