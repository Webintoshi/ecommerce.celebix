import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerIyzicoActivationRuntime } from "../server-iyzico-activation/default.ts";
import { createIyzicoActivationHttpHandlers } from "./handler.ts";

const handlers = createIyzicoActivationHttpHandlers({
  resolveRuntime: resolveDefaultServerIyzicoActivationRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

export async function handleIyzicoActivationCurrent(request: Request) {
  return handlers.current(request);
}

export async function handleIyzicoActivationBegin(request: Request) {
  return handlers.begin(request);
}

export async function handleIyzicoActivationActivate(request: Request) {
  return handlers.activate(request);
}
