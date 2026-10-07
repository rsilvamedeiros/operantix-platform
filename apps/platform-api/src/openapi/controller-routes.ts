import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

/** Routes declared by Nest controllers, as `METHOD /path/{param}` (OpenAPI path syntax). */
export function listControllerRoutes(controllers: readonly Type[]): string[] {
  return controllers.flatMap((controller) => {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const proto = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto).flatMap((name) => {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') return [];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (path === undefined || method === undefined) return [];
      return [`${RequestMethod[method]} ${toOpenApiPath(prefix, path)}`];
    });
  });
}

function toOpenApiPath(prefix: string, path: string): string {
  const joined = [prefix, path]
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0)
    .join('/');
  return `/${joined}`.replace(/:(\w+)/g, '{$1}');
}
