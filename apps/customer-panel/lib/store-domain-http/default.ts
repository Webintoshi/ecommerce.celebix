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
type ReplacementContext = Readonly<{ params: Promise<Readonly<{ replacementId: string }>> }>;

export const handleDefaultStoreDomains = handlers.collection;
export const handleDefaultStoreDomainReplacements = handlers.replacements;
export async function handleDefaultStoreDomainReplacementActivate(request: Request, context: ReplacementContext) { return handlers.replacementAction(request, (await context.params).replacementId, "activate"); }
export async function handleDefaultStoreDomainReplacementCancel(request: Request, context: ReplacementContext) { return handlers.replacementAction(request, (await context.params).replacementId, "cancel"); }
export async function handleDefaultStoreDomainReplacementRollback(request: Request, context: ReplacementContext) { return handlers.replacementAction(request, (await context.params).replacementId, "rollback"); }
export async function handleDefaultStoreDomainRecheck(request: Request, context: DomainContext) {
  return handlers.recheck(request, (await context.params).domainId);
}
export async function handleDefaultStoreDomainPrimary(request: Request, context: DomainContext) {
  return handlers.primary(request, (await context.params).domainId);
}
export async function handleDefaultStoreDomainDelete(request: Request, context: DomainContext) {
  return handlers.item(request, (await context.params).domainId);
}
