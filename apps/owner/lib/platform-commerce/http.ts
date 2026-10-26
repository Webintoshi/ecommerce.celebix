import "server-only";

import { isCommerceBridgeTimestampFresh, verifyCommerceBridgeSignature } from "./security.ts";

export type PlatformCommerceAction = "redeem" | "read" | "start" | "callback" | "webhook";
export type PlatformCommerceHttpOptions = Readonly<{
  key: Buffer;
  now: () => Date;
  execute: (action: PlatformCommerceAction, payload: unknown) => Promise<unknown>;
}>;

const PATH = "/api/internal/platform-commerce";
const BODY_LIMIT = 65_536;
const BODY_DEADLINE_MS = 2_000;
const RESPONSE_HEADERS = { "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff", "content-type": "application/json; charset=utf-8" };

function failure(status: 400 | 401 | 503): Response {
  const error = status === 400 ? "invalid_request" : status === 401 ? "unauthorized" : "service_unavailable";
  return Response.json({ ok: false, error }, { status, headers: RESPONSE_HEADERS });
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function duplicateJsonKeys(raw: string): boolean {
  const stack: Array<{ keys: Set<string>; expectingKey: boolean } | null> = [];
  for (const match of raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]/g)) {
    const value = match[0], current = stack.at(-1);
    if (value === "{") stack.push({ keys: new Set(), expectingKey: true });
    else if (value === "[") stack.push(null);
    else if (value === "}" || value === "]") stack.pop();
    else if (value === "," && current) current.expectingKey = true;
    else if (value.startsWith('"') && current?.expectingKey) {
      const key = JSON.parse(value) as string;
      if (current.keys.has(key)) return true;
      current.keys.add(key);
      current.expectingKey = false;
    }
  }
  return false;
}

async function readBody(request: Request): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const read = async () => {
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > BODY_LIMIT) { void reader.cancel().catch(() => {}); return null; }
        chunks.push(next.value);
      }
      const declared = request.headers.get("content-length");
      if (expired || (declared !== null && Number(declared) !== size)) return null;
      return Buffer.concat(chunks, size);
    } catch { return null; }
  };
  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => { timer = setTimeout(() => {
        expired = true;
        resolve(null);
        void reader.cancel().catch(() => {});
      }, BODY_DEADLINE_MS); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}

export function createPlatformCommerceHttpHandler(options: PlatformCommerceHttpOptions): (request: Request) => Promise<Response> {
  if (!options || !Buffer.isBuffer(options.key) || options.key.byteLength !== 32
    || typeof options.now !== "function" || typeof options.execute !== "function") throw new TypeError("platform_commerce_http_config_invalid");
  const key = Buffer.from(options.key), now = options.now, execute = options.execute;
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const declared = request.headers.get("content-length");
      if (request.method !== "POST" || url.pathname !== PATH || url.search || url.hash
        || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")
        || request.headers.has("content-encoding")
        || (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > BODY_LIMIT))) return failure(400);
      const timestamp = request.headers.get("x-celebix-commerce-timestamp") ?? "";
      const signature = request.headers.get("x-celebix-commerce-signature") ?? "";
      if (["origin", "authorization", "cookie", "proxy-authorization"].some((header) => request.headers.has(header))
        || [...request.headers.keys()].some((header) => header.startsWith("sec-fetch-") && !(header === 'sec-fetch-mode' && request.headers.get(header) === 'cors'))
        || !/^[0-9a-f]{64}$/.test(signature) || !isCommerceBridgeTimestampFresh(timestamp, now())) return failure(401);
      const body = await readBody(request);
      if (body === null) return failure(400);
      if (!verifyCommerceBridgeSignature({ key, timestamp, signature, body, now: now() })) return failure(401);
      let envelope: Record<string, unknown>;
      try {
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(body);
        const parsed = JSON.parse(raw) as unknown;
        if (!plainObject(parsed) || Object.keys(parsed).length !== 2
          || Object.keys(parsed).some((name) => name !== "action" && name !== "payload")
          || !["redeem", "read", "start", "callback", "webhook"].includes(parsed.action as string)
          || !plainObject(parsed.payload) || duplicateJsonKeys(raw)) return failure(400);
        envelope = parsed;
      } catch { return failure(400); }
      const result = await execute(envelope.action as PlatformCommerceAction, envelope.payload);
      return Response.json(result, { status: 200, headers: RESPONSE_HEADERS });
    } catch { return failure(503); }
  };
}
