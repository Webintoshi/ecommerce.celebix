import "server-only";

import { PANEL_SESSION_COOKIE_NAME } from "../session.ts";
import type { ServerPanelAccessResult } from "./access.ts";

type CookieStore = Readonly<{
  get(name: string): Readonly<{ value: string }> | undefined;
}>;

export async function resolveServerPanelSessionFromCookieStore(input: {
  cookieStore: CookieStore;
  requestId: string;
  now: Date;
  resolve(authority: Readonly<{
    credential: string | null;
    requestId: string;
    now: Date;
  }>): Promise<ServerPanelAccessResult>;
}): Promise<ServerPanelAccessResult> {
  const credential = input.cookieStore.get(PANEL_SESSION_COOKIE_NAME)?.value ?? null;
  if (credential === null) return Object.freeze({ kind: "unauthenticated" });
  return input.resolve({ credential, requestId: input.requestId, now: input.now });
}
