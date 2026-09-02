import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerAdminDomainRuntime } from "../server-admin-domains/default.ts";
import { createAdminDomainHttpHandlers } from "./handler.ts";

const handlers = createAdminDomainHttpHandlers({
  resolveRuntime: resolveDefaultServerAdminDomainRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

type DomainContext = Readonly<{ params: Promise<Readonly<{ domainId: string }>> }>;

export const handleDefaultAdminDomains = handlers.collection;
export async function handleDefaultAdminDomainRecheck(request: Request, context: DomainContext) {
  return handlers.recheck(request, (await context.params).domainId);
}
export async function handleDefaultAdminDomainPrimary(request: Request, context: DomainContext) {
  return handlers.primary(request, (await context.params).domainId);
}
export async function handleDefaultAdminDomainDelete(request: Request, context: DomainContext) {
  return handlers.item(request, (await context.params).domainId);
}
