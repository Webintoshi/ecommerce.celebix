import {
  FIXED_STOREFRONT_POLICIES,
  type StorefrontPolicyKey,
} from "@celebix/saas-contracts";
import type { StorePolicyAdminPage, StorePolicyStatus } from "@celebix/saas-data";

const MAXIMUM_RESPONSE_BYTES = 524_288;
const UTF8 = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const SAFE_CODES = Object.freeze(["invalid_input", "unauthenticated", "not_found", "version_conflict", "operation_mismatch", "operation_not_found", "membership_denied", "durable_authority_invalid", "store_inactive", "feature_not_enabled", "commit_unknown", "unavailable"] as const);
type SafeCode = (typeof SAFE_CODES)[number];

const MESSAGES: Readonly<Record<SafeCode, string>> = Object.freeze({
  invalid_input: "Politika bilgileri geçersiz.",
  unauthenticated: "Oturumunuz sona erdi.",
  not_found: "Politika bulunamadı.",
  version_conflict: "Politika sizden önce güncellendi. Sayfa yenilendi.",
  operation_mismatch: "İşlem güvenle tekrar edilemedi.",
  operation_not_found: "İşlem kanıtı bulunamadı.",
  membership_denied: "Bu işlem için yetkiniz yok.",
  durable_authority_invalid: "Yetkiniz yeniden doğrulanamadı.",
  store_inactive: "Mağaza işlemlere kapalı.",
  feature_not_enabled: "İçerik yönetimi planınızda etkin değil.",
  commit_unknown: "Kaydın sonucu doğrulanamadı; tekrar göndermeden sayfayı yenileyin.",
  unavailable: "Politika hizmeti şu anda kullanılamıyor.",
});

export class StorePolicyApiError extends Error {
  constructor(readonly code: SafeCode, readonly status: number) {
    super(MESSAGES[code]);
    this.name = "StorePolicyApiError";
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function unavailable(status = 503): StorePolicyApiError { return new StorePolicyApiError("unavailable", status || 503); }

function exact(value: unknown, required: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== required.length || keys.some((key) => typeof key !== "string" || !required.includes(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch { return null; }
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length !== 24) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : null;
}

function page(value: unknown): StorePolicyAdminPage {
  const parsed = exact(value, ["key", "label", "route", "ordinal", "status", "body", "version", "createdAt", "updatedAt"]);
  const index = parsed ? FIXED_STOREFRONT_POLICIES.findIndex(({ key }) => key === parsed.key) : -1;
  const definition = FIXED_STOREFRONT_POLICIES[index];
  if (!parsed || !definition || parsed.label !== definition.label || parsed.route !== definition.route || parsed.ordinal !== index + 1
    || (parsed.status !== "draft" && parsed.status !== "published") || typeof parsed.body !== "string" || parsed.body !== parsed.body.trim()
    || UTF8.encode(parsed.body).byteLength > 100_000 || CONTROL.test(parsed.body)
    || !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1 || !timestamp(parsed.createdAt) || !timestamp(parsed.updatedAt)) throw unavailable();
  return Object.freeze({ key: definition.key, label: definition.label, route: definition.route, ordinal: index + 1, status: parsed.status, body: parsed.body, version: parsed.version as number, createdAt: parsed.createdAt as string, updatedAt: parsed.updatedAt as string });
}

function items(value: unknown): readonly StorePolicyAdminPage[] {
  const parsed = exact(value, ["items"]);
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length > 7) throw unavailable();
  return Object.freeze(parsed.items.map(page));
}

async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const length = response.headers.get("content-length");
  if (type !== "application/json" || (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > MAXIMUM_RESPONSE_BYTES)) || response.body === null) throw unavailable(response.status);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let joined: Uint8Array | undefined;
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_RESPONSE_BYTES) { await reader.cancel().catch(() => undefined); throw unavailable(response.status); }
      chunks.push(new Uint8Array(next.value));
    }
    joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch (error) { if (error instanceof StorePolicyApiError) throw error; throw unavailable(response.status); }
  finally { joined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

function code(value: unknown): SafeCode {
  const parsed = exact(value, ["code"]);
  return parsed && typeof parsed.code === "string" && SAFE_CODES.includes(parsed.code as SafeCode) ? parsed.code as SafeCode : "unavailable";
}

export function createStorePolicyApi(fetcher: Fetcher = fetch, uuid: () => string = crypto.randomUUID.bind(crypto)) {
  async function request(path: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await fetcher(path, { ...init, credentials: "same-origin", cache: "no-store" });
      const payload = await readJson(response);
      if (!response.ok) throw new StorePolicyApiError(code(payload), response.status);
      return payload;
    } catch (error) { if (error instanceof StorePolicyApiError) throw error; throw unavailable(); }
  }
  return Object.freeze({
    async list(): Promise<readonly StorePolicyAdminPage[]> { return items(await request("/api/storefront-policies", { method: "GET" })); },
    async get(key: StorefrontPolicyKey): Promise<StorePolicyAdminPage> {
      if (!FIXED_STOREFRONT_POLICIES.some((definition) => definition.key === key)) throw unavailable(400);
      return page(await request(`/api/storefront-policies/${key}`, { method: "GET" }));
    },
    async save(key: StorefrontPolicyKey, input: Readonly<{ expectedVersion: number; body: string; status: StorePolicyStatus }>): Promise<StorePolicyAdminPage> {
      const operationId = uuid();
      if (!UUID.test(operationId) || !FIXED_STOREFRONT_POLICIES.some((definition) => definition.key === key)) throw unavailable();
      return page(await request(`/api/storefront-policies/${key}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId, expectedVersion: input.expectedVersion, body: input.body, status: input.status }),
      }));
    },
  });
}

export const storePolicyApi = createStorePolicyApi();
