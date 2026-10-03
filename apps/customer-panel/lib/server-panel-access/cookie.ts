import "server-only";

import { SUPPORT_COOKIE_NAME } from "../platform-support/policy.ts";

import { PANEL_SESSION_COOKIE_NAME } from "../session.ts";
import type { ServerPanelAccessResult } from "./access.ts";

type CookieStore = Readonly<{
  get(name: string): Readonly<{ value: string }> | undefined;
}>;

export async function resolveServerPanelSessionFromCookieStore(input: {
  cookieStore: CookieStore;
  requestId: string;
  now: Date;
  hostname?: string | null;
  resolve(authority: Readonly<{
    credential: string | null;
    requestId: string;
    now: Date;
    hostname?: string | null;
  }>): Promise<ServerPanelAccessResult>;
}): Promise<ServerPanelAccessResult> {
  const support = input.cookieStore.get(SUPPORT_COOKIE_NAME)?.value;
  const credential = support === undefined ? input.cookieStore.get(PANEL_SESSION_COOKIE_NAME)?.value ?? null : "support:" + support;
  if (credential === null) return Object.freeze({ kind: "unauthenticated" });
  return input.resolve({ credential, requestId: input.requestId, now: input.now, hostname: input.hostname });
}
