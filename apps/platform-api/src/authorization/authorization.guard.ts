import { type CanActivate, Injectable } from '@nestjs/common';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  canActivate(): boolean {
    throw new Error('Not implemented');
  }
}
