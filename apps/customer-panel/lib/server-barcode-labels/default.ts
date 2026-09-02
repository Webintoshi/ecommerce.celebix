import "server-only";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerBarcodeLabelRuntime } from "./runtime.ts";
export async function resolveDefaultServerBarcodeLabelRuntime() {
  return resolveServerBarcodeLabelRuntime(
    await resolveDefaultServerPanelAccessRuntime(),
  );
}
