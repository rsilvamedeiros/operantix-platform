import { createParamDecorator } from '@nestjs/common';

export const CurrentPrincipal = createParamDecorator(() => undefined);
