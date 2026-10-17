import { loadConfig } from './core/config.ts';
import { createLogger, LogRing } from './core/logger.ts';
import { buildRouteSpecs, createServices } from './context.ts';
import type { RouteSpec } from './http/route.ts';

/** Route specs used to generate the OpenAPI document (in-memory services, handlers never invoked). */
export function allRouteSpecs(): RouteSpec[] {
  const config = loadConfig({ CANGZE_DATA_DIR: '/nonexistent' });
  const services = createServices(config, { memory: true, logger: createLogger('silent', new LogRing()) });
  return buildRouteSpecs(services);
}
