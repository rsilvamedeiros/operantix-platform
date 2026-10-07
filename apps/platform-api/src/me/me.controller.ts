import { Controller, Get } from '@nestjs/common';
import type { Principal } from '../auth/access-token-verifier';
import { CurrentPrincipal } from '../auth/current-principal.decorator';

@Controller('v1/me')
export class MeController {
  @Get()
  me(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }
}
