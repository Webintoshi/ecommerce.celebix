import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerAdminHostAuthRuntime } from "./runtime.ts";

export async function resolveDefaultServerAdminHostAuthRuntime() {
  return resolveServerAdminHostAuthRuntime(await resolveDefaultServerPanelAccessRuntime());
}
