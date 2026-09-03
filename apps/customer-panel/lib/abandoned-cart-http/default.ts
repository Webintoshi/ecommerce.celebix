import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerAbandonedCartRuntime } from "../server-abandoned-carts/default.ts";
import { createAbandonedCartHttpHandlers } from "./handler.ts";

async function runtime() { return resolveDefaultServerAbandonedCartRuntime(); }
const handlers = createAbandonedCartHttpHandlers({ resolveRuntime: runtime, now: () => new Date(), requestId: randomUUID });
type Context = Readonly<{ params: Promise<Readonly<{ cartId: string }>> }>;

export const handleDefaultAbandonedCartSummary = handlers.getSummary;
export const handleDefaultAbandonedCartList = handlers.list;
export async function handleDefaultAbandonedCartGet(request: Request, context: Context) { return handlers.get(request, (await context.params).cartId); }
export async function handleDefaultAbandonedCartRecoveryLink(request: Request, context: Context) { return handlers.issueRecoveryLink(request, (await context.params).cartId); }
export async function handleDefaultAbandonedCartMarkContacted(request: Request, context: Context) { return handlers.recordRecoveryAttempt(request, (await context.params).cartId, "contacted"); }
export async function handleDefaultAbandonedCartNote(request: Request, context: Context) { return handlers.recordRecoveryAttempt(request, (await context.params).cartId, "note"); }
export async function handleDefaultAbandonedCartRecovered(request: Request, context: Context) { return handlers.markRecovered(request, (await context.params).cartId); }
export async function handleDefaultAbandonedCartArchive(request: Request, context: Context) { return handlers.archive(request, (await context.params).cartId); }
