// Aggregates every module's tables for drizzle-kit. Application code imports each module's
// own schema file instead, so modules don't reach into each other's tables.
export * from '../identity/identity.schema';
export * from '../organizations/organizations.schema';
export * from '../audit/audit.schema';
