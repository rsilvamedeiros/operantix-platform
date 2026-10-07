import 'reflect-metadata';
import type { Server } from 'node:http';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AccessTokenVerifier, InvalidAccessTokenError } from '../auth/access-token-verifier';
import { AuthGuard } from '../auth/auth.guard';
import { ACCESS_TOKEN_VERIFIER } from '../auth/auth.tokens';
import { Public } from '../auth/public.decorator';
import type { Role } from '../identity/identity.schema';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import {
  MEMBERSHIP_LOOKUP,
  type MembershipLookup,
  type TenantContext,
} from '../tenancy/tenant-context';
import { AuthorizationGuard } from './authorization.guard';
import { RequirePermission } from './require-permission.decorator';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;

const ORG = '6f1c1c1e-8a52-4d0e-9a51-3f3b8f0f2a10';
const OTHER_ORG = '0b7f3f39-2a8c-4c55-9f0e-1a9d6c2b7e44';

// The bearer token is the subject, so each test picks its caller.
const fakeVerifier: AccessTokenVerifier = {
  verify: (token) =>
    token.startsWith('sub-')
      ? Promise.resolve({ subject: token })
      : Promise.reject(new InvalidAccessTokenError('bad token')),
};

const memberships: Record<string, { userId: string; role: Role } | undefined> = {
  [`sub-viewer:${ORG}`]: { userId: 'u-viewer', role: 'VIEWER' },
  [`sub-admin:${ORG}`]: { userId: 'u-admin', role: 'ADMIN' },
};

const fakeLookup: MembershipLookup = {
  findMembership: (authSubject, organizationId) =>
    Promise.resolve(memberships[`${authSubject}:${organizationId}`]),
};

@Controller('v1/organizations/:organizationId')
class ProbeController {
  @RequirePermission('workspace:read')
  @Get('read')
  read(@CurrentTenant() tenant: TenantContext): TenantContext {
    return tenant;
  }

  @RequirePermission('workspace:create')
  @Get('create')
  create(): { ok: true } {
    return { ok: true };
  }

  // Tenant-scoped route that forgot to declare a permission.
  @Get('undeclared')
  undeclared(): { ok: true } {
    return { ok: true };
  }
}

@Controller('probe')
class UnscopedController {
  @Get('authenticated')
  authenticated(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('public')
  open(): { ok: true } {
    return { ok: true };
  }

  // A permission needs a tenant to be evaluated against.
  @RequirePermission('workspace:read')
  @Get('no-tenant')
  noTenant(): { ok: true } {
    return { ok: true };
  }

  // Misuse: reads the tenant on a route that is not tenant-scoped.
  @Get('misused')
  misused(@CurrentTenant() tenant: TenantContext): TenantContext {
    return tenant;
  }
}

describe('AuthorizationGuard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController, UnscopedController],
      providers: [
        { provide: ACCESS_TOKEN_VERIFIER, useValue: fakeVerifier },
        { provide: MEMBERSHIP_LOOKUP, useValue: fakeLookup },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: AuthorizationGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, subject?: string) => {
    const req = request(httpServer(app)).get(path);
    return subject ? req.set('Authorization', `Bearer ${subject}`) : req;
  };

  it('resolves the tenant context from the membership of the caller', async () => {
    const res = await get(`/v1/organizations/${ORG}/read`, 'sub-viewer');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizationId: ORG, userId: 'u-viewer', role: 'VIEWER' });
  });

  it('answers 404 to a caller that is not a member, without revealing the organization', async () => {
    const res = await get(`/v1/organizations/${OTHER_ORG}/read`, 'sub-admin');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' });
  });

  it('answers 404 to a malformed organization id without querying memberships', async () => {
    const res = await get('/v1/organizations/not-a-uuid/read', 'sub-admin');

    expect(res.status).toBe(404);
  });

  it('answers 403 when the role lacks the permission', async () => {
    const res = await get(`/v1/organizations/${ORG}/create`, 'sub-viewer');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'FORBIDDEN', message: 'Not allowed' });
  });

  it('allows a role that has the permission', async () => {
    const res = await get(`/v1/organizations/${ORG}/create`, 'sub-admin');

    expect(res.status).toBe(200);
  });

  it('denies a tenant-scoped route that declares no permission', async () => {
    const res = await get(`/v1/organizations/${ORG}/undeclared`, 'sub-admin');

    expect(res.status).toBe(403);
  });

  it('denies a permission on a route without an organization', async () => {
    const res = await get('/probe/no-tenant', 'sub-admin');

    expect(res.status).toBe(403);
  });

  it('lets authenticated routes outside a tenant through', async () => {
    const res = await get('/probe/authenticated', 'sub-viewer');

    expect(res.status).toBe(200);
  });

  it('leaves public routes public', async () => {
    const res = await get('/probe/public');

    expect(res.status).toBe(200);
  });

  it('still requires authentication before authorization', async () => {
    const res = await get(`/v1/organizations/${ORG}/read`);

    expect(res.status).toBe(401);
  });

  it('fails loudly when CurrentTenant is used outside a tenant-scoped route', async () => {
    const res = await get('/probe/misused', 'sub-viewer');

    expect(res.status).toBe(500);
  });
});
