import { canonicalPanelBrowserBindingCredential } from "./credential-codec.ts";

const MAXIMUM_BINDING_SECONDS = 900;
const NAME = "__Host-celebix_panel_pre_auth";

function invalid(): never {
  throw new Error("panel_browser_binding_cookie_invalid");
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid();
  return milliseconds;
}

function trustedNow(value: unknown): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value.getTime();
}

export const PANEL_BROWSER_BINDING_DELETION_COOKIE =
  "__Host-celebix_panel_pre_auth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

export function serializePanelBrowserBindingCookie(input: {
  credential: string;
  expiresAt: string;
  now: Date;
}): string {
  if (!input || Object.keys(input).some((key) => !["credential", "expiresAt", "now"].includes(key))) invalid();
  const credential = canonicalPanelBrowserBindingCredential(input.credential);
  const remaining = timestamp(input.expiresAt) - trustedNow(input.now);
  const maxAge = Math.floor(remaining / 1_000);
  if (maxAge < 1 || maxAge > MAXIMUM_BINDING_SECONDS) invalid();
  return `${NAME}=${credential}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function parsePanelBrowserBindingCookie(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.trim() !== value || /[\u0000-\u0020\u007f"%,;]/.test(value)) invalid();
  const prefix = `${NAME}=`;
  if (!value.startsWith(prefix) || value.indexOf("=", prefix.length) !== -1) invalid();
  return canonicalPanelBrowserBindingCredential(value.slice(prefix.length));
}
