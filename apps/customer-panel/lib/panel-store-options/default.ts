import "server-only";

import { cookies } from "next/headers";

import { PANEL_SESSION_COOKIE_NAME } from "../session.ts";
import { resolveDefaultServerAdminHostAuthRuntime } from "../server-admin-host-auth/default.ts";
import type { PanelStoreOption } from "./postgres-repository.ts";

const EMPTY: readonly PanelStoreOption[] = Object.freeze([]);

export async function resolveDefaultPanelStoreOptions(activeStoreId: string): Promise<readonly PanelStoreOption[]> {
  try {
    const credential = (await cookies()).get(PANEL_SESSION_COOKIE_NAME)?.value;
    if (!credential) return EMPTY;
    const runtime = await resolveDefaultServerAdminHostAuthRuntime();
    if (!runtime) return EMPTY;
    const result = await runtime.storeOptions.listForCredential({ credential, now: new Date() });
    if (result.kind !== "resolved" || result.activeStoreId !== activeStoreId) return EMPTY;
    return result.stores;
  } catch { return EMPTY; }
}
