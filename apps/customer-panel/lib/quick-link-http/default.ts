import "server-only";

import { randomUUID } from "node:crypto";

import { generateQuickLinkToken } from "@celebix/saas-data";

import { resolveDefaultServerQuickLinksRuntime } from "../server-quick-links/default.ts";
import { createQuickLinkHttpHandlers } from "./handler.ts";

const handlers = createQuickLinkHttpHandlers({
  resolveRuntime: resolveDefaultServerQuickLinksRuntime,
  now: () => new Date(),
  requestId: randomUUID,
  generateId: randomUUID,
  generateToken: generateQuickLinkToken,
});

type QuickLinkRouteContext = Readonly<{
  params: Promise<Readonly<{ linkId: string }>>;
}>;

export const handleDefaultQuickLinkList = handlers.list;
export const handleDefaultQuickLinkCreate = handlers.create;
export const handleDefaultQuickLinkPaymentMethods = handlers.paymentMethods;
export const handleDefaultQuickLinkActivateProvider = handlers.activateProvider;
export const handleDefaultQuickLinkRevokeProvider = handlers.revokeProvider;

export async function handleDefaultQuickLinkGet(request: Request, context: QuickLinkRouteContext) {
  const { linkId } = await context.params;
  return handlers.get(request, linkId);
}

export async function handleDefaultQuickLinkCancel(request: Request, context: QuickLinkRouteContext) {
  const { linkId } = await context.params;
  return handlers.cancel(request, linkId);
}

export async function handleDefaultQuickLinkDuplicate(request: Request, context: QuickLinkRouteContext) {
  const { linkId } = await context.params;
  return handlers.duplicate(request, linkId);
}

export async function handleDefaultQuickLinkRevealUrl(request: Request, context: QuickLinkRouteContext) {
  const { linkId } = await context.params;
  return handlers.revealUrl(request, linkId);
}
