import { startTelemetryFromEnv } from '@operantix/telemetry';

// Imported first by every entrypoint: metrics start, then HTTP and PostgreSQL are instrumented as their modules load.
export const telemetry = startTelemetryFromEnv(process.env, 'integration-worker');
