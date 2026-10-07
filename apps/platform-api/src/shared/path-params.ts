import { type HttpException, type PipeTransform } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts a uuid path segment; anything else is answered like an unknown resource. */
export class UuidParamPipe implements PipeTransform<string, string> {
  constructor(private readonly notFound: () => HttpException) {}

  transform(value: string): string {
    if (!UUID.test(value)) throw this.notFound();
    return value;
  }
}

/** Accepts a positive integer path segment; anything else is answered like an unknown resource. */
export class PositiveIntParamPipe implements PipeTransform<string, number> {
  constructor(private readonly notFound: () => HttpException) {}

  transform(value: string): number {
    if (!/^[1-9]\d{0,8}$/.test(value)) throw this.notFound();
    return Number(value);
  }
}
