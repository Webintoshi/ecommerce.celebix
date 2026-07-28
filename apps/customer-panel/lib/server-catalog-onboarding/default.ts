import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerCatalogOnboardingRuntime } from "./runtime.ts";

export async function resolveDefaultServerCatalogOnboardingRuntime() {
  return resolveServerCatalogOnboardingRuntime(await resolveDefaultServerPanelAccessRuntime());
}
