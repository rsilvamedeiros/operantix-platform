import { startTracingFromEnv } from '@operantix/telemetry';

// Imported first by every entrypoint: HTTP and PostgreSQL are instrumented as their modules load.
export const tracing = startTracingFromEnv(process.env, 'workflow-worker');
