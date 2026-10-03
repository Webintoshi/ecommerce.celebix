import "server-only";

import type { TenantContext } from "@celebix/saas-contracts";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolvePanelBrandingRepository, resolvePanelStoreBranding, type PanelStoreBranding } from "./service.ts";

export async function resolveDefaultPanelStoreBranding(context: TenantContext | null): Promise<PanelStoreBranding | null> {
  if (!context) return null;
  let repository = null;
  try { repository = resolvePanelBrandingRepository(await resolveDefaultServerPanelAccessRuntime()); } catch {}
  return resolvePanelStoreBranding({ context, repository, now: new Date() });
}
