import {
  parsePublicStorefrontDesign,
  parseStorefrontDesignDocument,
  parseStorefrontDesignWorkspace,
  type StorefrontDesignDocument,
  type StorefrontDesignDraftMutation,
  type StorefrontDesignMediaOption,
  type StorefrontDesignPublicationMutation,
  type StorefrontDesignWorkspace,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_RESPONSE_BYTES = 1_048_576;
const CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "origin_denied", "store_inactive",
  "feature_not_enabled", "durable_authority_invalid", "version_conflict", "operation_mismatch",
  "not_found", "conflict", "unavailable",
] as const);
export type StorefrontDesignApiErrorCode = (typeof CODES)[number];
const MESSAGES: Readonly<Record<StorefrontDesignApiErrorCode, string>> = Object.freeze({
  invalid_input: "Bilgileri kontrol edin.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu işlem için yetkiniz yok.",
  origin_denied: "Güvenlik doğrulaması başarısız oldu.",
  store_inactive: "Mağaza şu anda aktif değil.",
  feature_not_enabled: "Tasarım özelliği planınızda etkin değil.",
  durable_authority_invalid: "Mağaza yetkisi yenilenmeli.",
  version_conflict: "Tasarım başka bir oturumda değişti. Güncel sürüm yüklenmeli.",
  operation_mismatch: "İşlem güvenle tekrarlanamadı.",
  not_found: "Tasarım kaydı bulunamadı.",
  conflict: "Bu görsel zaten farklı bilgilerle kaydedildi.",
  unavailable: "Tasarım işlemi şu anda tamamlanamadı.",
});

export class StorefrontDesignApiError extends Error {
  constructor(readonly code: StorefrontDesignApiErrorCode = "unavailable", readonly status = 503) {
    super(MESSAGES[code]);
    this.name = "StorefrontDesignApiError";
  }
}

export interface StorefrontDesignApi {
  workspace(signal?: AbortSignal): Promise<StorefrontDesignWorkspace>;
  saveDraft(input: Readonly<{ expectedDraftVersion: number; design: StorefrontDesignDocument }>, signal?: AbortSignal): Promise<StorefrontDesignDraftMutation>;
  publish(input: Readonly<{ expectedDraftVersion: number; expectedPublishedVersion: number }>, signal?: AbortSignal): Promise<StorefrontDesignPublicationMutation>;
  uploadMedia(input: Readonly<{ file: File; altText: string }>, signal?: AbortSignal): Promise<StorefrontDesignMediaOption>;
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new StorefrontDesignApiError();
  return value as Record<string, unknown>;
}
function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new StorefrontDesignApiError(); return value as number; }
function timestamp(value: unknown): string { if (typeof value !== "string" || new Date(value).toISOString() !== value) throw new StorefrontDesignApiError(); return value; }
function operation(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) throw new StorefrontDesignApiError("invalid_input", 400); return value; }

async function responseJson(response: Response): Promise<unknown> {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new StorefrontDesignApiError();
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new StorefrontDesignApiError();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) { bytes.fill(0); throw new StorefrontDesignApiError(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new StorefrontDesignApiError(); }
  finally { bytes.fill(0); }
}

function errorCode(value: unknown): StorefrontDesignApiErrorCode {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).join(",") !== "code") return "unavailable";
  const code = (value as Record<string, unknown>).code;
  return CODES.includes(code as never) ? code as StorefrontDesignApiErrorCode : "unavailable";
}

function draftMutation(value: unknown): StorefrontDesignDraftMutation {
  const parsed = record(value, ["draftVersion", "draftUpdatedAt", "draft"]);
  return Object.freeze({ draftVersion: positive(parsed.draftVersion), draftUpdatedAt: timestamp(parsed.draftUpdatedAt), draft: parseStorefrontDesignDocument(parsed.draft) });
}

function publicationMutation(value: unknown): StorefrontDesignPublicationMutation {
  const parsed = record(value, ["draftVersion", "publishedVersion", "publishedAt", "published"]);
  const publishedVersion = positive(parsed.publishedVersion);
  const publishedAt = timestamp(parsed.publishedAt);
  const published = parsePublicStorefrontDesign(parsed.published);
  if (published.publicationVersion !== publishedVersion || published.publishedAt !== publishedAt) throw new StorefrontDesignApiError();
  return Object.freeze({ draftVersion: positive(parsed.draftVersion), publishedVersion, publishedAt, published });
}

function mediaOption(value: unknown): StorefrontDesignMediaOption {
  const parsed = record(value, ["id", "url", "altText", "mediaType", "width", "height"]);
  if (typeof parsed.id !== "string" || !UUID.test(parsed.id) || typeof parsed.url !== "string" || !parsed.url.startsWith("https://") || typeof parsed.altText !== "string" || parsed.altText.length > 500 || !["image/jpeg", "image/png", "image/webp"].includes(parsed.mediaType as string)) throw new StorefrontDesignApiError();
  const width = positive(parsed.width), height = positive(parsed.height);
  if (width > 8192 || height > 8192) throw new StorefrontDesignApiError();
  return Object.freeze({ id: parsed.id, url: parsed.url, altText: parsed.altText, mediaType: parsed.mediaType as StorefrontDesignMediaOption["mediaType"], width, height });
}

export function createStorefrontDesignApi(fetcher: typeof fetch = fetch, uuid: () => string = crypto.randomUUID.bind(crypto)): StorefrontDesignApi {
  if (typeof fetcher !== "function" || typeof uuid !== "function") throw new StorefrontDesignApiError("invalid_input", 400);
  async function request<T>(path: string, parser: (value: unknown) => T, init: RequestInit): Promise<T> {
    let selected: Response;
    try { selected = await fetcher(path, Object.freeze({ credentials: "same-origin", cache: "no-store", ...init })); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; throw new StorefrontDesignApiError(); }
    const value = await responseJson(selected);
    if (!selected.ok) throw new StorefrontDesignApiError(errorCode(value), selected.status);
    try { return parser(value); } catch (error) { if (error instanceof StorefrontDesignApiError) throw error; throw new StorefrontDesignApiError(); }
  }
  function mutate<T>(path: string, method: "PATCH" | "POST", value: unknown, parser: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
    const operationId = operation(uuid());
    return request(path, parser, { method, headers: Object.freeze({ "content-type": "application/json", "idempotency-key": operationId }), body: JSON.stringify(value), signal });
  }
  return Object.freeze({
    workspace(signal?: AbortSignal) {
      return request("/api/storefront-design", (value) => parseStorefrontDesignWorkspace(record(value, ["code", "workspace"]).workspace), { method: "GET", signal });
    },
    saveDraft(input: Readonly<{ expectedDraftVersion: number; design: StorefrontDesignDocument }>, signal?: AbortSignal) {
      const expectedDraftVersion = positive(input?.expectedDraftVersion);
      const design = parseStorefrontDesignDocument(input?.design);
      return mutate("/api/storefront-design/draft", "PATCH", { expectedDraftVersion, design }, (value) => draftMutation(record(value, ["code", "result"]).result), signal);
    },
    publish(input: Readonly<{ expectedDraftVersion: number; expectedPublishedVersion: number }>, signal?: AbortSignal) {
      const expectedDraftVersion = positive(input?.expectedDraftVersion);
      const expectedPublishedVersion = positive(input?.expectedPublishedVersion);
      return mutate("/api/storefront-design/publish", "POST", { expectedDraftVersion, expectedPublishedVersion }, (value) => publicationMutation(record(value, ["code", "result"]).result), signal);
    },
    uploadMedia(input: Readonly<{ file: File; altText: string }>, signal?: AbortSignal) {
      if (!(input?.file instanceof File) || typeof input.altText !== "string" || input.altText !== input.altText.trim() || input.altText.length > 500) throw new StorefrontDesignApiError("invalid_input", 400);
      const form = new FormData(); form.set("file", input.file); form.set("altText", input.altText);
      return request("/api/storefront-design/media", (value) => mediaOption(record(value, ["code", "media"]).media), { method: "POST", headers: Object.freeze({ "idempotency-key": operation(uuid()) }), body: form, signal });
    },
  });
}

export const storefrontDesignApi = createStorefrontDesignApi();
