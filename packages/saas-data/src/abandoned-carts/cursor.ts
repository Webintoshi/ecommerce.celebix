import type { AbandonedCartListItem, AbandonedCartSort, AbandonedCartStatus } from "@celebix/saas-contracts";

import { abandonedCartFingerprint } from "./canonical.ts";
import { AbandonedCartRepositoryError } from "./errors.ts";
import { ABANDONED_CART_UUID } from "./validation.ts";

export interface DatabaseAbandonedCartCursor {
  readonly totalCents: number;
  readonly lastActivityAt: string;
  readonly id: string;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3}|\.\d{6})Z$/;

function fail(): never { throw new AbandonedCartRepositoryError("invalid_input"); }

function amount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail();
  return value as number;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !TIMESTAMP.test(value) || !Number.isFinite(new Date(value).getTime())) fail();
  return value;
}

function comparable(value: string): string { return value.replace(/\.(\d{3})Z$/, ".$1000Z"); }

function binding(storeId: string, status: AbandonedCartStatus | undefined, search: string | undefined, sort: AbandonedCartSort, cursor: DatabaseAbandonedCartCursor): string {
  return abandonedCartFingerprint("list_cursor", storeId, { status: status ?? null, search: search ?? null, sort, ...cursor });
}

export function parseDatabaseAbandonedCartCursor(value: unknown, lastItem: Readonly<AbandonedCartListItem>): DatabaseAbandonedCartCursor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "id,lastActivityAt,totalCents") fail();
  const selected = Object.freeze({ totalCents: amount(parsed.totalCents), lastActivityAt: timestamp(parsed.lastActivityAt), id: parsed.id });
  if (typeof selected.id !== "string" || !ABANDONED_CART_UUID.test(selected.id) || selected.id !== lastItem.id || selected.totalCents !== lastItem.totalCents || comparable(selected.lastActivityAt) !== comparable(lastItem.lastActivityAt)) fail();
  return selected as DatabaseAbandonedCartCursor;
}

export function encodeAbandonedCartCursor(storeId: string, status: AbandonedCartStatus | undefined, search: string | undefined, sort: AbandonedCartSort, cursor: DatabaseAbandonedCartCursor): string {
  return Buffer.from(JSON.stringify({ version: 1, binding: binding(storeId, status, search, sort, cursor), sort, ...cursor }), "utf8").toString("base64url");
}

export function decodeAbandonedCartCursor(value: string | undefined, storeId: string, status: AbandonedCartStatus | undefined, search: string | undefined, sort: AbandonedCartSort): DatabaseAbandonedCartCursor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) fail();
    const parsed = JSON.parse(decoded.toString("utf8")) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.keys(parsed).sort().join(",") !== "binding,id,lastActivityAt,sort,totalCents,version" || parsed.version !== 1 || parsed.sort !== sort || typeof parsed.binding !== "string" || !/^[a-f0-9]{64}$/.test(parsed.binding) || typeof parsed.id !== "string" || !ABANDONED_CART_UUID.test(parsed.id)) fail();
    const cursor = Object.freeze({ totalCents: amount(parsed.totalCents), lastActivityAt: timestamp(parsed.lastActivityAt), id: parsed.id });
    if (parsed.binding !== binding(storeId, status, search, sort, cursor)) fail();
    return cursor;
  } catch (error) {
    if (error instanceof AbandonedCartRepositoryError) throw error;
    fail();
  }
}
