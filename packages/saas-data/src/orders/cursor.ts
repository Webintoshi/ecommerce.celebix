import type { OrderListItem, OrderStatus } from "@celebix/saas-contracts";

import { orderFingerprint } from "./canonical.ts";
import { OrderRepositoryError } from "./errors.ts";
import { ORDER_UUID } from "./validation.ts";

interface OrderCursor {
  readonly version: 1;
  readonly binding: string;
  readonly createdAt: string;
  readonly id: string;
}

interface DatabaseOrderCursor {
  readonly createdAt: string;
  readonly id: string;
}

const CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3}|\.\d{6})Z$/;

function fail(): never {
  throw new OrderRepositoryError("invalid_input");
}

function binding(storeId: string, status: OrderStatus | undefined, search: string | undefined): string {
  return orderFingerprint("list_cursor", storeId, { status: status ?? null, search: search ?? null });
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !CURSOR_TIMESTAMP.test(value)) fail();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail();
  return value;
}

export function parseDatabaseCursor(value: unknown, lastItem: Readonly<OrderListItem>): DatabaseOrderCursor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "createdAt,id") fail();
  const createdAt = timestamp(parsed.createdAt);
  if (
    typeof parsed.id !== "string" ||
    !ORDER_UUID.test(parsed.id) ||
    parsed.id !== lastItem.id ||
    new Date(createdAt).getTime() !== new Date(lastItem.createdAt).getTime()
  ) fail();
  return Object.freeze({ createdAt, id: parsed.id });
}

export function encodeOrderCursor(
  storeId: string,
  status: OrderStatus | undefined,
  search: string | undefined,
  cursor: DatabaseOrderCursor,
): string {
  return Buffer.from(JSON.stringify({
    version: 1,
    binding: binding(storeId, status, search),
    createdAt: cursor.createdAt,
    id: cursor.id,
  } satisfies OrderCursor), "utf8").toString("base64url");
}

export function decodeOrderCursor(
  value: string | undefined,
  storeId: string,
  status: OrderStatus | undefined,
  search: string | undefined,
): OrderCursor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) fail();
    const parsed = JSON.parse(decoded.toString("utf8")) as Record<string, unknown>;
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !== "binding,createdAt,id,version" ||
      parsed.version !== 1 ||
      parsed.binding !== binding(storeId, status, search) ||
      typeof parsed.binding !== "string" || !/^[a-f0-9]{64}$/.test(parsed.binding) ||
      typeof parsed.id !== "string" || !ORDER_UUID.test(parsed.id)
    ) fail();
    timestamp(parsed.createdAt);
    return Object.freeze(parsed) as unknown as OrderCursor;
  } catch (error) {
    if (error instanceof OrderRepositoryError) throw error;
    fail();
  }
}
