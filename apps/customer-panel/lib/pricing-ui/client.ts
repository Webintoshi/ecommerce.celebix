import {
  parsePriceList,
  parsePriceListItem,
  parsePriceListRule,
  parsePricingPreviewRequest,
  parsePricingPreviewResult,
  type PriceChannel,
  type PriceList,
  type PriceListItem,
  type PriceListRule,
  type PricingPreviewRequest,
  type PricingPreviewResult,
} from "@celebix/saas-contracts";

type ServerPricingApiErrorCode = "invalid_input" | "conflict" | "forbidden" | "not_found" | "unauthenticated" | "method_not_allowed" | "unavailable";
export type PricingApiErrorCode = ServerPricingApiErrorCode | "mutation_pending" | "verification_unavailable";
export type PricingErrorState = "error" | "denied" | "conflict" | "not_found" | "unavailable" | "verification_unavailable";
export type PricingMutationState = "idle" | "pending" | "verification_unavailable";

export class PricingApiError extends Error {
  readonly code: PricingApiErrorCode;
  readonly status: number;
  constructor(code: PricingApiErrorCode, status: number) {
    super(code);
    this.name = "PricingApiError";
    this.code = code;
    this.status = status;
    Object.freeze(this);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCAL_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const MICROSECOND_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CODES = ["invalid_input", "conflict", "forbidden", "not_found", "unauthenticated", "method_not_allowed", "unavailable"] as const;
type Fetch = typeof fetch;

export interface SavePriceListIntent {
  readonly priceListId?: string;
  readonly expectedVersion?: number;
  readonly name: string;
  readonly items: readonly PriceListItem[];
  readonly rules: readonly PriceListRule[];
}

export interface PricingRuleDraft {
  readonly channel: PriceChannel;
  readonly customerTagId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly priority: string;
  readonly persistedStartsAt?: string;
  readonly persistedEndsAt?: string;
}

export interface PriceListIntentDraft {
  readonly priceListId?: string;
  readonly expectedVersion?: number;
  readonly name: string;
  readonly items: readonly PriceListItem[];
  readonly rules: readonly PricingRuleDraft[];
}

function invalid(): never { throw new TypeError("pricing_client_invalid"); }
function id(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) return invalid(); return value; }
function version(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= Number.MAX_SAFE_INTEGER) return invalid(); return value as number; }

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional]), keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) return invalid();
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") return invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function dense(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) return invalid();
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalid();
    output.push(descriptor.value);
  }
  return output;
}

export function parsePricingUtcLocal(value: string): string {
  const match = LOCAL_UTC.exec(value);
  if (!match) return invalid();
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59) return invalid();
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(hour, minute, 0, 0);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || parsed.getUTCHours() !== hour || parsed.getUTCMinutes() !== minute) return invalid();
  return parsed.toISOString();
}

export function formatPricingUtcLocal(value?: string): string {
  if (value === undefined) return "";
  if (!ISO_UTC.test(value)) return invalid();
  const normalized = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) return invalid();
  return normalized.slice(0, 16);
}

export function pricingRuleDraft(value?: PriceListRule): PricingRuleDraft {
  const rule: PriceListRule = value === undefined ? Object.freeze({ channel: "storefront" as const, priority: 0 }) : parsePriceListRule(value);
  return Object.freeze({
    channel: rule.channel,
    customerTagId: rule.customerTagId ?? "",
    startsAt: formatPricingUtcLocal(rule.startsAt),
    endsAt: formatPricingUtcLocal(rule.endsAt),
    priority: String(rule.priority),
    persistedStartsAt: rule.startsAt ?? "",
    persistedEndsAt: rule.endsAt ?? "",
  });
}

export function canAddPricingRule(count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100) return invalid();
  return count < 100;
}

function pricingDraftTime(display: unknown, persisted: unknown): string | undefined {
  if (typeof display !== "string" || typeof persisted !== "string") return invalid();
  if (persisted !== "") {
    if (formatPricingUtcLocal(persisted) !== display) return invalid();
    return persisted;
  }
  return display === "" ? undefined : parsePricingUtcLocal(display);
}

export function buildPriceListIntent(value: PriceListIntentDraft): SavePriceListIntent {
  const parsed = exact(value, ["name", "items", "rules"], ["priceListId", "expectedVersion"]);
  if (typeof parsed.name !== "string" || parsed.name.length < 1 || parsed.name.length > 200 || parsed.name !== parsed.name.trim() || ((parsed.priceListId === undefined) !== (parsed.expectedVersion === undefined))) return invalid();
  const items = Object.freeze(dense(parsed.items, 1, 500).map(parsePriceListItem));
  const rules = Object.freeze(dense(parsed.rules, 1, 100).map((entry) => {
    const draft = exact(entry, ["channel", "customerTagId", "startsAt", "endsAt", "priority"], ["persistedStartsAt", "persistedEndsAt"]);
    if ((draft.channel !== "storefront" && draft.channel !== "quick_order") || typeof draft.customerTagId !== "string" || typeof draft.startsAt !== "string" || typeof draft.endsAt !== "string" || typeof draft.priority !== "string" || !/^(?:0|[1-9]\d{0,3})$/.test(draft.priority)) return invalid();
    const priority = Number(draft.priority); if (priority > 1000) return invalid();
    const startsAt = pricingDraftTime(draft.startsAt, draft.persistedStartsAt ?? "");
    const endsAt = pricingDraftTime(draft.endsAt, draft.persistedEndsAt ?? "");
    if (endsAt !== undefined && (startsAt === undefined || endsAt <= startsAt)) return invalid();
    return parsePriceListRule({
      channel: draft.channel,
      ...(draft.customerTagId === "" ? {} : { customerTagId: id(draft.customerTagId) }),
      ...(startsAt === undefined ? {} : { startsAt }),
      ...(endsAt === undefined ? {} : { endsAt }),
      priority,
    });
  }));
  return Object.freeze({
    ...(parsed.priceListId === undefined ? {} : { priceListId: id(parsed.priceListId), expectedVersion: version(parsed.expectedVersion) }),
    name: parsed.name,
    items,
    rules,
  });
}

async function read(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim(); if (contentType !== "application/json") throw new PricingApiError("unavailable", 503);
  const declared = response.headers.get("content-length"); if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > 1_048_576)) throw new PricingApiError("unavailable", 503);
  const reader = response.body?.getReader(); if (!reader) throw new PricingApiError("unavailable", 503); const chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > 1_048_576) { await reader.cancel().catch(() => undefined); throw new PricingApiError("unavailable", 503); } chunks.push(new Uint8Array(next.value)); } } catch (error) { if (error instanceof PricingApiError) throw error; if (error instanceof DOMException && error.name === "AbortError") throw error; throw new PricingApiError("unavailable", 503); }
  if (declared !== null && Number(declared) !== total) throw new PricingApiError("unavailable", 503); const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new PricingApiError("unavailable", 503); }
}

function apiError(value: unknown, status: number) {
  try {
    const parsed = exact(value, ["code"]);
    if (typeof parsed.code !== "string" || !CODES.includes(parsed.code as never)) throw new Error();
    const code = parsed.code as ServerPricingApiErrorCode;
    const expected: Record<ServerPricingApiErrorCode, number> = { invalid_input: 400, conflict: 409, forbidden: 403, not_found: 404, unauthenticated: 401, method_not_allowed: 405, unavailable: 503 };
    return new PricingApiError(expected[code] === status ? code : "unavailable", expected[code] === status ? status : 503);
  } catch { return new PricingApiError("unavailable", 503); }
}

function items(value: unknown): readonly PriceList[] { const parsed = exact(value, ["items"]); return Object.freeze(dense(parsed.items, 0, 500).map(parsePriceList)); }

function pricingPreviewSelection(value: unknown, maximum: number): PricingPreviewRequest {
  const parsed = exact(value, ["channel", "variantIds"]);
  if (parsed.channel !== "storefront" && parsed.channel !== "quick_order") return invalid();
  const variantIds = Object.freeze(dense(parsed.variantIds, 1, maximum).map(id));
  if (new Set(variantIds).size !== variantIds.length) return invalid();
  return Object.freeze({ channel: parsed.channel, variantIds });
}

function correlatedPricingPreviewResult(
  value: unknown,
  request: PricingPreviewRequest,
): PricingPreviewResult {
  const raw = exact(value, ["entries", "asOf"]);
  if (typeof raw.asOf !== "string" || !MICROSECOND_UTC.test(raw.asOf)) return invalid();
  const result = parsePricingPreviewResult(raw);
  const requested = new Set(request.variantIds);
  if (
    result.entries.length !== request.variantIds.length
    || result.entries.some((entry) => (
      entry.channel !== request.channel || !requested.delete(entry.variantId)
    ))
    || requested.size !== 0
  ) return invalid();
  return result;
}

export function pricingErrorState(value: unknown): PricingErrorState {
  if (!(value instanceof PricingApiError)) return "error";
  if (value.code === "forbidden" || value.code === "unauthenticated") return "denied";
  if (value.code === "conflict") return "conflict";
  if (value.code === "not_found") return "not_found";
  if (value.code === "verification_unavailable") return "verification_unavailable";
  if (value.code === "unavailable") return "unavailable";
  return "error";
}

export function createPricingApi(fetcher: Fetch = fetch, uuid: () => string = () => crypto.randomUUID()) {
  if (typeof fetcher !== "function" || typeof uuid !== "function") invalid();
  async function request<T>(path: string, parser: (value: unknown) => T, body?: unknown, signal?: AbortSignal): Promise<T> {
    try {
      const response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}), ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
      const value = await read(response); if (!response.ok) throw apiError(value, response.status);
      try { return parser(value); } catch (error) { if (error instanceof PricingApiError) throw error; throw new PricingApiError("unavailable", 503); }
    } catch (error) {
      if (error instanceof PricingApiError || (error instanceof DOMException && error.name === "AbortError")) throw error;
      throw new PricingApiError("unavailable", 503);
    }
  }
  function operation() { return id(uuid()); }
  return Object.freeze({
    async list(signal?: AbortSignal) { return request("/api/pricing/price-lists", items, undefined, signal); },
    async get(priceListId: string, signal?: AbortSignal) { return request(`/api/pricing/price-lists/${id(priceListId)}`, parsePriceList, undefined, signal); },
    async save(value: SavePriceListIntent, signal?: AbortSignal) {
      const parsed = exact(value, ["name", "items", "rules"], ["priceListId", "expectedVersion"]);
      if (typeof parsed.name !== "string" || ((parsed.priceListId === undefined) !== (parsed.expectedVersion === undefined))) return invalid();
      const safeItems = Object.freeze(dense(parsed.items, 1, 500).map(parsePriceListItem));
      const safeRules = Object.freeze(dense(parsed.rules, 1, 100).map(parsePriceListRule));
      return request("/api/pricing/price-lists", parsePriceList, { operationId: operation(), ...(parsed.priceListId === undefined ? {} : { priceListId: id(parsed.priceListId), expectedVersion: version(parsed.expectedVersion) }), name: parsed.name, items: safeItems, rules: safeRules }, signal);
    },
    async activate(priceListId: string, expectedVersion: number, signal?: AbortSignal) { return request(`/api/pricing/price-lists/${id(priceListId)}/activate`, parsePriceList, { operationId: operation(), expectedVersion: version(expectedVersion) }, signal); },
    async archive(priceListId: string, expectedVersion: number, signal?: AbortSignal) { return request(`/api/pricing/price-lists/${id(priceListId)}/archive`, parsePriceList, { operationId: operation(), expectedVersion: version(expectedVersion) }, signal); },
    async preview(value: PricingPreviewRequest, signal?: AbortSignal) {
      let safe: PricingPreviewRequest;
      try {
        safe = parsePricingPreviewRequest(pricingPreviewSelection(value, 100));
      } catch {
        return invalid();
      }
      return request(
        "/api/pricing/preview",
        (result) => correlatedPricingPreviewResult(result, safe),
        safe,
        signal,
      );
    },
  });
}

export type PricingApi = ReturnType<typeof createPricingApi>;

export type PricingPreviewSnapshot =
  | Readonly<{ phase: "idle" | "loading" | "unavailable" }>
  | Readonly<{ phase: "loaded"; result: PricingPreviewResult }>;

export function createPricingPreviewController(
  api: Pick<PricingApi, "preview">,
  onChange: (snapshot: PricingPreviewSnapshot) => void,
) {
  if (!api || typeof api.preview !== "function" || typeof onChange !== "function") invalid();
  let generation = 0;
  let current: AbortController | undefined;
  const publish = (snapshot: PricingPreviewSnapshot) => onChange(Object.freeze(snapshot));
  return Object.freeze({
    load(input: PricingPreviewRequest) {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const selected = ++generation;
      publish({ phase: "loading" });
      let requests: readonly Promise<PricingPreviewResult>[];
      try {
        const safe = pricingPreviewSelection(input, 500);
        requests = Object.freeze(Array.from(
          { length: Math.ceil(safe.variantIds.length / 100) },
          (_, index) => {
            const batch = parsePricingPreviewRequest({
              channel: safe.channel,
              variantIds: safe.variantIds.slice(index * 100, (index + 1) * 100),
            });
            return api.preview(batch, controller.signal).then((result) => (
              correlatedPricingPreviewResult(result, batch)
            ));
          },
        ));
      } catch {
        if (current === controller && generation === selected) {
          current = undefined;
          controller.abort();
          publish({ phase: "unavailable" });
        }
        return;
      }
      void Promise.all(requests).then((results) => {
        if (!controller.signal.aborted && current === controller && generation === selected) {
          current = undefined;
          const entries = Object.freeze(results.flatMap(({ entries }) => entries).sort((left, right) => (
            left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0
          )));
          const asOf = results.reduce(
            (latest, result) => result.asOf > latest ? result.asOf : latest,
            results[0]!.asOf,
          );
          publish({ phase: "loaded", result: Object.freeze({ entries, asOf }) });
        }
      }).catch(() => {
        if (!controller.signal.aborted && current === controller && generation === selected) {
          current = undefined;
          controller.abort();
          publish({ phase: "unavailable" });
        }
      });
    },
    clear() {
      current?.abort();
      current = undefined;
      generation += 1;
      publish({ phase: "idle" });
    },
    dispose() {
      current?.abort();
      current = undefined;
      generation += 1;
    },
  });
}

export function createPricingRequestLifecycle() {
  let mounted = false;
  let generation = 0;
  let setupGeneration = 0;
  return Object.freeze({
    setup() {
      const ownedSetup = ++setupGeneration;
      mounted = true;
      generation += 1;
      let cleaned = false;
      return () => {
        if (cleaned) return;
        cleaned = true;
        if (setupGeneration === ownedSetup) {
          mounted = false;
          generation += 1;
        }
      };
    },
    begin() {
      if (!mounted) throw new Error("pricing_lifecycle_disposed");
      const owned = ++generation;
      let cancelled = false;
      return Object.freeze({
        current: () => mounted && !cancelled && generation === owned,
        cancel() {
          if (cancelled) return;
          cancelled = true;
          if (mounted && generation === owned) generation += 1;
        },
      });
    },
  });
}

export function createPricingMutationController(api: Pick<PricingApi, "save" | "activate" | "archive">) {
  if (!api || typeof api.save !== "function" || typeof api.activate !== "function" || typeof api.archive !== "function") return invalid();
  let current: PricingMutationState = "idle";
  let pending: Readonly<{ promise: Promise<PriceList>; controller: AbortController; reject(error: unknown): void; settled(): boolean; markSettled(): void }> | undefined;

  function locked(): Promise<PriceList> { return Promise.reject(new PricingApiError("verification_unavailable", 503)); }
  function execute(operation: (signal: AbortSignal) => Promise<PriceList>): Promise<PriceList> {
    if (current === "verification_unavailable") return locked();
    if (pending) return Promise.reject(new PricingApiError("mutation_pending", 409));
    const controller = new AbortController(); let resolve!: (value: PriceList) => void, reject!: (error: unknown) => void, done = false;
    const promise = new Promise<PriceList>((accept, deny) => { resolve = accept; reject = deny; });
    pending = Object.freeze({ promise, controller, reject, settled: () => done, markSettled: () => { done = true; } });
    current = "pending";
    queueMicrotask(() => {
      const owned = pending;
      if (!owned || owned.promise !== promise || owned.settled()) return;
      void operation(controller.signal).then((value) => {
        if (owned.settled()) return;
        owned.markSettled(); pending = undefined; current = "idle"; resolve(value);
      }).catch((error: unknown) => {
        if (owned.settled()) return;
        owned.markSettled(); pending = undefined;
        if ((error instanceof PricingApiError && error.code === "unavailable") || (error instanceof DOMException && error.name === "AbortError")) {
          current = "verification_unavailable";
          reject(new PricingApiError("verification_unavailable", 503));
        } else { current = "idle"; reject(error); }
      });
    });
    return promise;
  }

  return Object.freeze({
    state: () => current,
    save: (value: SavePriceListIntent) => execute((signal) => api.save(value, signal)),
    activate: (priceListId: string, expectedVersion: number) => execute((signal) => api.activate(priceListId, expectedVersion, signal)),
    archive: (priceListId: string, expectedVersion: number) => execute((signal) => api.archive(priceListId, expectedVersion, signal)),
    dispose() {
      const owned = pending;
      if (!owned || owned.settled()) return;
      owned.markSettled(); pending = undefined; current = "verification_unavailable"; owned.controller.abort(); owned.reject(new PricingApiError("verification_unavailable", 503));
    },
  });
}

export const pricingApi = createPricingApi();
