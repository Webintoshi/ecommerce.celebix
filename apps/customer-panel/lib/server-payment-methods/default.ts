import "server-only";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerPaymentMethodsRuntime } from "./runtime.ts";

export async function resolveDefaultServerPaymentMethodsRuntime() {
  return resolveServerPaymentMethodsRuntime(await resolveDefaultServerPanelAccessRuntime());
}
