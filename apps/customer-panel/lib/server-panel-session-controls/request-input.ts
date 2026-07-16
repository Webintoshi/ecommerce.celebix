import "server-only";

import { validatePersistentPanelSessionCredential } from "../panel-session-completion/cookie.ts";

const PANEL_SESSION_COOKIE_NAME = "__Host-celebix_panel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTIVE_STORE_MAXIMUM_BYTES = 256;
const LOGOUT_MAXIMUM_BYTES = 16;
const COOKIE_MAXIMUM_BYTES = 4_096;

type InvalidInput = Readonly<{ kind: "invalid" }>;
const INVALID = Object.freeze({ kind: "invalid" as const });

function exactJsonContentType(request: Request): boolean {
  return request.headers.get("content-type") === "application/json" &&
    request.headers.get("transfer-encoding") === null;
}

async function boundedBody(request: Request, maximumBytes: number): Promise<string | null> {
  if (!exactJsonContentType(request) || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (total === 0) return null;
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { return null; }
}

export async function parseActiveStoreSelectionRequest(
  request: Request,
): Promise<InvalidInput | Readonly<{ kind: "valid"; storeId: string }>> {
  const raw = await boundedBody(request, ACTIVE_STORE_MAXIMUM_BYTES);
  if (raw === null || !/^\{\s*"storeId"\s*:\s*"[0-9a-f-]+"\s*\}$/.test(raw)) return INVALID;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return INVALID; }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return INVALID;
  const row = parsed as Record<string, unknown>;
  if (Object.keys(row).length !== 1 || !UUID.test(row.storeId as string)) return INVALID;
  return Object.freeze({ kind: "valid" as const, storeId: row.storeId as string });
}

export async function parsePanelSessionLogoutRequest(
  request: Request,
): Promise<InvalidInput | Readonly<{ kind: "valid" }>> {
  const raw = await boundedBody(request, LOGOUT_MAXIMUM_BYTES);
  if (raw === null || !/^\{\s*\}$/.test(raw)) return INVALID;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return INVALID; }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.keys(parsed).length !== 0) return INVALID;
  return Object.freeze({ kind: "valid" as const });
}

export type PersistentPanelSessionCookieRead = Readonly<
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "present"; credential: string }
>;

export function readPersistentPanelSessionCookie(request: Request): PersistentPanelSessionCookieRead {
  const header = request.headers.get("cookie");
  if (header === null) return Object.freeze({ kind: "missing" });
  if (
    new TextEncoder().encode(header).byteLength > COOKIE_MAXIMUM_BYTES ||
    /[\u0000-\u001f\u007f]/.test(header)
  ) return INVALID;
  let credential: string | undefined;
  for (const rawPart of header.split(";")) {
    const part = rawPart.replace(/^[ \t]+/, "");
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator) !== PANEL_SESSION_COOKIE_NAME) continue;
    if (credential !== undefined) return INVALID;
    const value = part.slice(separator + 1);
    if (!value || value.trim() !== value || value.includes('"')) return INVALID;
    credential = value;
  }
  if (credential === undefined) return Object.freeze({ kind: "missing" });
  try {
    return Object.freeze({
      kind: "present" as const,
      credential: validatePersistentPanelSessionCredential(credential),
    });
  } catch { return INVALID; }
}
