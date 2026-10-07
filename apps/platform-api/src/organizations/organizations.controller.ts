import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import type { Principal } from '../auth/access-token-verifier';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import {
  type CreateOrganizationInput,
  createOrganizationSchema,
  type MyOrganizationView,
  type OrganizationView,
} from './organization.dto';
import { OrganizationSlugTakenError, OrganizationsService } from './organizations.service';

// Not tenant-scoped: any authenticated caller may create an organization or list their own.
@Controller('v1/organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<{ data: MyOrganizationView[] }> {
    return { data: await this.organizations.listForPrincipal(principal) };
  }

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createOrganizationSchema)) input: CreateOrganizationInput,
  ): Promise<OrganizationView> {
    try {
      return await this.organizations.create(principal, input);
    } catch (error) {
      if (error instanceof OrganizationSlugTakenError) {
        throw new ConflictException({
          code: 'ORGANIZATION_SLUG_TAKEN',
          message: 'Organization slug already in use',
        });
      }
      throw error;
    }
  }
}
