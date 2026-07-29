import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPaymentMethodsRuntime } from "../server-payment-methods/default.ts";
import { createPaymentMethodHttpHandlers } from "./handler.ts";

const handlers = createPaymentMethodHttpHandlers({
  resolveRuntime: resolveDefaultServerPaymentMethodsRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

type MethodContext = Readonly<{
  params: Promise<Readonly<{ methodId: string }>>;
}>;

export async function handlePaymentProviderCatalog(request: Request) {
  return handlers.catalog(request);
}

export async function handlePaymentMethods(request: Request) {
  return handlers.methods(request);
}

export async function handlePaymentMethodState(request: Request, context: MethodContext) {
  return handlers.state(request, (await context.params).methodId);
}

export async function handlePaymentMethodReorder(request: Request) {
  return handlers.reorder(request);
}
