import type { INestApplication } from '@nestjs/common';
import {
  type CorrelationRequest,
  type CorrelationResponse,
  createCorrelationMiddleware,
  type JsonLogger,
} from '@operantix/telemetry';

// The slice of the Express request/response used here; avoids a direct Express type dependency.
interface HttpRequest extends CorrelationRequest {
  readonly method: string;
  readonly path: string;
}

interface HttpResponse extends CorrelationResponse {
  readonly statusCode: number;
  on(event: 'finish', listener: () => void): unknown;
}

const ACCESS_CONTEXT = 'HttpAccess';

/**
 * Correlation id per request plus one access log line when the response is done. The line carries
 * method, path (no query string: it can hold tokens), status and duration, and no header values.
 */
export function installHttpObservability(app: INestApplication, logger?: JsonLogger): void {
  const correlation = createCorrelationMiddleware();
  app.use((req: HttpRequest, res: HttpResponse, next: () => void) => {
    correlation(req, res, () => {
      if (logger) {
        const started = process.hrtime.bigint();
        res.on('finish', () => {
          logger.log(
            {
              event: 'http request',
              method: req.method,
              path: req.path,
              status: res.statusCode,
              durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
            },
            ACCESS_CONTEXT,
          );
        });
      }
      next();
    });
  });
}
