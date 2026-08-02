import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerToshiProviderRuntime } from "../server-toshi-providers/runtime.ts";
import {
  createToshiProviderHttpHandlers,
  type ToshiProviderRouteContext,
} from "./handler.ts";

async function runtime() {
  return resolveServerToshiProviderRuntime(await resolveDefaultServerPanelAccessRuntime());
}

const handlers = createToshiProviderHttpHandlers({
  resolveRuntime: runtime,
  now: () => new Date(),
  requestId: randomUUID,
  uuid: randomUUID,
});

export function handleToshiProviderList(request: Request) {
  return handlers.list(request);
}

export function handleToshiProviderConnect(request: Request, context: ToshiProviderRouteContext) {
  return handlers.connect(request, context);
}

export function handleToshiProviderModel(request: Request, context: ToshiProviderRouteContext) {
  return handlers.selectModel(request, context);
}

export function handleToshiProviderDefault(request: Request, context: ToshiProviderRouteContext) {
  return handlers.setDefault(request, context);
}

export function handleToshiProviderRevoke(request: Request, context: ToshiProviderRouteContext) {
  return handlers.revoke(request, context);
}
