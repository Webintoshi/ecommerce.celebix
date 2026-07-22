import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerAbandonedCartRuntime } from "../server-abandoned-carts/runtime.ts";
import { createAbandonedCartHttpHandlers } from "./handler.ts";

async function runtime() { return resolveServerAbandonedCartRuntime(await resolveDefaultServerPanelAccessRuntime()); }
const handlers = createAbandonedCartHttpHandlers({ resolveRuntime: runtime, now: () => new Date(), requestId: randomUUID });
type Context = Readonly<{ params: Promise<Readonly<{ cartId: string }>> }>;

export const handleDefaultAbandonedCartSummary = handlers.getSummary;
export const handleDefaultAbandonedCartList = handlers.list;
export async function handleDefaultAbandonedCartGet(request: Request, context: Context) { return handlers.get(request, (await context.params).cartId); }
export async function handleDefaultAbandonedCartRecovered(request: Request, context: Context) { return handlers.markRecovered(request, (await context.params).cartId); }
export async function handleDefaultAbandonedCartArchive(request: Request, context: Context) { return handlers.archive(request, (await context.params).cartId); }
