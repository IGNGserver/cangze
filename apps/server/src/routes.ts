import type { RouteSpec } from './http/route.ts';
import { systemRoutes } from './modules/system/routes.ts';

/** Route specs used to generate the OpenAPI document (handlers are never invoked). */
export function allRouteSpecs(): RouteSpec[] {
  return [...systemRoutes({ startedAt: new Date(0), readiness: {}, setupRequired: () => true })];
}
