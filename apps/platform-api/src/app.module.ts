import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import type { Pool } from 'pg';
import { JwtAccessTokenVerifier } from './auth/access-token-verifier';
import { AuthGuard } from './auth/auth.guard';
import { ACCESS_TOKEN_VERIFIER } from './auth/auth.tokens';
import { AuthorizationGuard } from './authorization/authorization.guard';
import type { AppConfig } from './config/config';
import { createDatabase, type Database } from './database/database';
import { DATABASE } from './database/database.tokens';
import { HealthController } from './health/health.controller';
import { HEALTH_OPTIONS, READINESS_CHECKS } from './health/health.tokens';
import { createPostgresPool, postgresReadinessCheck } from './infrastructure/postgres';
import { createRedisClient, type RedisClient, redisReadinessCheck } from './infrastructure/redis';
import { MeController } from './me/me.controller';
import { OrganizationsController } from './organizations/organizations.controller';
import { OrganizationsService } from './organizations/organizations.service';
import { WorkspacesController } from './organizations/workspaces.controller';
import { WorkspacesService } from './organizations/workspaces.service';
import { DrizzleMembershipLookup } from './tenancy/drizzle-membership-lookup';
import { MEMBERSHIP_LOOKUP } from './tenancy/tenant-context';
import { WorkflowsController } from './workflows/workflows.controller';
import { WorkflowsService } from './workflows/workflows.service';

export const POSTGRES_POOL = Symbol('POSTGRES_POOL');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
class ConnectionsLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    // destroy() also stops a pending reconnect loop, which close() would wait on.
    this.redis.destroy();
    await this.pool.end();
  }
}

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    const timeoutMs = config.health.checkTimeoutMs;
    return {
      module: AppModule,
      controllers: [
        HealthController,
        MeController,
        OrganizationsController,
        WorkspacesController,
        WorkflowsController,
      ],
      providers: [
        {
          provide: POSTGRES_POOL,
          useFactory: () => createPostgresPool(config.database, timeoutMs),
        },
        { provide: DATABASE, inject: [POSTGRES_POOL], useFactory: createDatabase },
        {
          provide: MEMBERSHIP_LOOKUP,
          inject: [DATABASE],
          useFactory: (db: Database) => new DrizzleMembershipLookup(db),
        },
        { provide: REDIS_CLIENT, useFactory: () => createRedisClient(config.redis, timeoutMs) },
        {
          provide: READINESS_CHECKS,
          inject: [POSTGRES_POOL, REDIS_CLIENT],
          useFactory: (pool: Pool, redis: RedisClient) => [
            postgresReadinessCheck(pool),
            redisReadinessCheck(redis),
          ],
        },
        { provide: HEALTH_OPTIONS, useValue: config.health },
        {
          provide: ACCESS_TOKEN_VERIFIER,
          // Keys are fetched lazily on first use and cached; unknown kids trigger a refetch.
          useFactory: () =>
            new JwtAccessTokenVerifier(createRemoteJWKSet(new URL(config.auth.jwksUri)), {
              issuer: config.auth.issuer,
              audience: config.auth.audience,
            }),
        },
        // Guards run in registration order: authenticate, then authorize.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: AuthorizationGuard },
        OrganizationsService,
        WorkspacesService,
        WorkflowsService,
        ConnectionsLifecycle,
      ],
    };
  }
}
