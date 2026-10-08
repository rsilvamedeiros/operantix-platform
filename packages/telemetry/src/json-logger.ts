import { currentCorrelationId } from './correlation';
import { sanitize } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface JsonLoggerOptions {
  readonly service: string;
  readonly environment: string;
  readonly level?: LogLevel;
  /** Where lines go; stdout by default. */
  readonly write?: (line: string) => void;
  readonly now?: () => Date;
}

/**
 * One JSON object per line. Shaped like Nest's LoggerService so it can be handed to
 * `app.useLogger`, without depending on Nest. Stack traces are not logged: they leak paths
 * and the error code plus message is what operators search for.
 */
export class JsonLogger {
  private readonly threshold: number;
  private readonly write: (line: string) => void;
  private readonly now: () => Date;

  constructor(private readonly options: JsonLoggerOptions) {
    this.threshold = SEVERITY[options.level ?? 'info'];
    this.write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
    this.now = options.now ?? (() => new Date());
  }

  log(message: unknown, context?: string): void {
    this.emit('info', message, context);
  }

  error(message: unknown, context?: string): void {
    this.emit('error', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.emit('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.emit('debug', message, context);
  }

  /** Nest's verbose level is folded into debug. */
  verbose(message: unknown, context?: string): void {
    this.emit('debug', message, context);
  }

  private emit(level: LogLevel, message: unknown, context?: string): void {
    if (SEVERITY[level] < this.threshold) return;
    const correlationId = currentCorrelationId();
    const record: Record<string, unknown> = {
      timestamp: this.now().toISOString(),
      level,
      service: this.options.service,
      environment: this.options.environment,
      ...(context === undefined ? {} : { context }),
      ...(correlationId === undefined ? {} : { correlationId }),
      ...describe(message),
    };
    this.write(JSON.stringify(record));
  }
}

function describe(message: unknown): Record<string, unknown> {
  if (message instanceof Error) {
    return { message: message.message, error: { name: message.name } };
  }
  if (typeof message === 'object' && message !== null) {
    const { event, message: text, ...rest } = message as Record<string, unknown>;
    const label = typeof event === 'string' ? event : typeof text === 'string' ? text : '';
    return {
      message: label,
      ...(Object.keys(rest).length === 0 ? {} : { fields: sanitize(rest) }),
    };
  }
  return { message: String(message) };
}
