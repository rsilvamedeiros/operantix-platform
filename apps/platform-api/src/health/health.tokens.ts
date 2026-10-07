export const READINESS_CHECKS = Symbol('READINESS_CHECKS');
export const HEALTH_OPTIONS = Symbol('HEALTH_OPTIONS');

export interface HealthOptions {
  checkTimeoutMs: number;
}
