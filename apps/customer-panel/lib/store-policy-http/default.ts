import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerStorePolicyRuntime } from "../server-store-policy/default.ts";
import { createStorePolicyHttpHandlers } from "./handler.ts";

const handlers = createStorePolicyHttpHandlers({
  resolveRuntime: resolveDefaultServerStorePolicyRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

type Context = Readonly<{ params: Promise<Readonly<{ policyKey: string }>> }>;

export async function handleStorePolicies(request: Request) {
  return handlers.collection(request);
}

export async function handleStorePolicy(request: Request, context: Context) {
  return handlers.item(request, (await context.params).policyKey);
}
