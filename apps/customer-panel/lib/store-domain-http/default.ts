import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerStoreDomainRuntime } from "../server-store-domains/default.ts";
import { createStoreDomainHttpHandlers } from "./handler.ts";

const handlers = createStoreDomainHttpHandlers({
  resolveRuntime: resolveDefaultServerStoreDomainRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

type DomainContext = Readonly<{ params: Promise<Readonly<{ domainId: string }>> }>;

export const handleDefaultStoreDomains = handlers.collection;
export async function handleDefaultStoreDomainRecheck(request: Request, context: DomainContext) {
  return handlers.recheck(request, (await context.params).domainId);
}
export async function handleDefaultStoreDomainPrimary(request: Request, context: DomainContext) {
  return handlers.primary(request, (await context.params).domainId);
}
export async function handleDefaultStoreDomainDelete(request: Request, context: DomainContext) {
  return handlers.item(request, (await context.params).domainId);
}
