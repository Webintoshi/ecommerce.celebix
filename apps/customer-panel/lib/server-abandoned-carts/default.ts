import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerAbandonedCartRuntime } from "./runtime.ts";

export async function resolveDefaultServerAbandonedCartRuntime() {
  return resolveServerAbandonedCartRuntime(await resolveDefaultServerPanelAccessRuntime());
}
