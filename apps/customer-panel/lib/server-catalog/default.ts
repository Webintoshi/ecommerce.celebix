import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerCatalogRuntime } from "./runtime.ts";

export async function resolveDefaultServerCatalogRuntime() {
  return resolveServerCatalogRuntime(await resolveDefaultServerPanelAccessRuntime());
}
