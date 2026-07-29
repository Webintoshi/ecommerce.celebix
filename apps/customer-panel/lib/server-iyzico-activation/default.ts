import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerIyzicoActivationRuntime } from "./runtime.ts";

export async function resolveDefaultServerIyzicoActivationRuntime() {
  const access = await resolveDefaultServerPanelAccessRuntime();
  return resolveServerIyzicoActivationRuntime(access);
}
