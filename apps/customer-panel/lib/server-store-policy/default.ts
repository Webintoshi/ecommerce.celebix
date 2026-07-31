import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerStorePolicyRuntime } from "./runtime.ts";

export async function resolveDefaultServerStorePolicyRuntime() {
  return resolveServerStorePolicyRuntime(await resolveDefaultServerPanelAccessRuntime());
}
