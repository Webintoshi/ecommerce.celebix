import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerQuickLinksRuntime } from "./runtime.ts";

export async function resolveDefaultServerQuickLinksRuntime() {
  return resolveServerQuickLinksRuntime(await resolveDefaultServerPanelAccessRuntime());
}
