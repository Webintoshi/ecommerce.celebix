import { ABANDONED_CART_SORTS, ABANDONED_CART_STATUSES, type AbandonedCartSort, type AbandonedCartStatus } from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const INVALID = Object.freeze({ kind: "invalid" as const });

export type AbandonedCartListInput = Readonly<{ pageSize: number; cursor?: string; status?: AbandonedCartStatus; search?: string; sort: AbandonedCartSort }>;

export function readAbandonedCartListInput(request: Request): typeof INVALID | Readonly<{ kind: "valid"; value: AbandonedCartListInput }> {
  let url: URL; try { url = new URL(request.url); } catch { return INVALID; }
  const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (new TextEncoder().encode(raw).byteLength > 4_096 || (raw && (raw.startsWith("&") || raw.endsWith("&") || raw.includes("&&")))) return INVALID;
  const entries = [...url.searchParams.entries()];
  if (entries.some(([key]) => !["pageSize", "cursor", "status", "search", "sort"].includes(key)) || new Set(entries.map(([key]) => key)).size !== entries.length) return INVALID;
  const rawPageSize = url.searchParams.get("pageSize");
  const pageSize = rawPageSize === null ? 20 : /^(?:[1-9]|[1-9]\d|100)$/.test(rawPageSize) ? Number(rawPageSize) : null;
  const cursor = url.searchParams.get("cursor"); const status = url.searchParams.get("status"); const search = url.searchParams.get("search"); const sort = url.searchParams.get("sort");
  if (pageSize === null || (cursor !== null && !CURSOR.test(cursor)) || (status !== null && !ABANDONED_CART_STATUSES.includes(status as AbandonedCartStatus)) || (sort !== null && !ABANDONED_CART_SORTS.includes(sort as AbandonedCartSort)) || (search !== null && (search.length < 1 || search.length > 200 || search.trim() !== search || CONTROL.test(search)))) return INVALID;
  return Object.freeze({ kind: "valid" as const, value: Object.freeze({ pageSize, ...(cursor === null ? {} : { cursor }), ...(status === null ? {} : { status: status as AbandonedCartStatus }), ...(search === null ? {} : { search }), sort: (sort ?? "newest") as AbandonedCartSort }) });
}

async function boundedJson(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const declared = request.headers.get("content-length"); if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > 4_096)) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > 4_096) { await reader.cancel().catch(() => undefined); return null; } chunks.push(new Uint8Array(next.value)); } } catch { return null; }
  if (total === 0) return null; const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
}

export async function readAbandonedCartMutationInput(request: Request) {
  const operationId = request.headers.get("idempotency-key");
  if (operationId === null || !UUID.test(operationId) || operationId.trim() !== operationId || operationId.includes(",")) return INVALID;
  const raw = await boundedJson(request);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype || Object.keys(raw as object).join(",") !== "expectedVersion") return INVALID;
  const expectedVersion = (raw as Record<string, unknown>).expectedVersion;
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 1) return INVALID;
  return Object.freeze({ kind: "valid" as const, operationId, expectedVersion: expectedVersion as number });
}

export function readAbandonedCartPathId(value: unknown): string | null { return typeof value === "string" && UUID.test(value) ? value : null; }
