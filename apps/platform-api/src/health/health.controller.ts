import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { HEALTH_OPTIONS, type HealthOptions, READINESS_CHECKS } from './health.tokens';
import { evaluateReadiness, type ReadinessCheck, type ReadinessReport } from './readiness';

// Probes are called by the orchestrator without credentials and expose only up/down.
@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(READINESS_CHECKS) private readonly checks: readonly ReadinessCheck[],
    @Inject(HEALTH_OPTIONS) private readonly options: HealthOptions,
  ) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await evaluateReadiness(this.checks, this.options.checkTimeoutMs, (failure) => {
      this.logger.warn(`Readiness check failed: ${failure.name} (${failure.reason})`);
    });
    if (report.status === 'error') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
