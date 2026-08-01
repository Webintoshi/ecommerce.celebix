import { createHash } from "node:crypto";

import type { OrderDraftListItem } from "@celebix/saas-contracts";

import { OrderRepositoryError } from "./errors.ts";
import { ORDER_UUID } from "./validation.ts";

const DRAFT_CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3}|\.\d{6})Z$/;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`;
}

export function canonicalOrderJson(value: unknown): string {
  return stableSerialize(value);
}

export function orderFingerprint(kind: string, storeId: string, payload: unknown): string {
  return createHash("sha256")
    .update(stableSerialize({ kind, storeId, payload }), "utf8")
    .digest("hex");
}

interface DatabaseDraftCursor {
  readonly updatedAt: string;
  readonly id: string;
}

function draftCursorFail(): never {
  throw new OrderRepositoryError("invalid_input");
}

function draftCursorTimestamp(value: unknown): string {
  if (typeof value !== "string" || !DRAFT_CURSOR_TIMESTAMP.test(value)) draftCursorFail();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) draftCursorFail();
  return value;
}

function comparableTimestamp(value: string): string {
  return value.replace(/\.(\d{3})Z$/, ".$1000Z");
}

function draftCursorBinding(storeId: string, cursor: DatabaseDraftCursor): string {
  return orderFingerprint("draft_list_cursor", storeId, cursor);
}

export function parseDatabaseDraftCursor(
  value: unknown,
  lastItem: Readonly<OrderDraftListItem>,
): Readonly<DatabaseDraftCursor> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) draftCursorFail();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "id,updatedAt") draftCursorFail();
  const updatedAt = draftCursorTimestamp(parsed.updatedAt);
  if (
    typeof parsed.id !== "string" ||
    !ORDER_UUID.test(parsed.id) ||
    parsed.id !== lastItem.id ||
    comparableTimestamp(updatedAt) !== comparableTimestamp(lastItem.updatedAt)
  ) draftCursorFail();
  return Object.freeze({ updatedAt, id: parsed.id });
}

export function encodeDraftCursor(storeId: string, cursor: DatabaseDraftCursor): string {
  return Buffer.from(JSON.stringify({
    version: 1,
    binding: draftCursorBinding(storeId, cursor),
    updatedAt: cursor.updatedAt,
    id: cursor.id,
  }), "utf8").toString("base64url");
}

export function decodeDraftCursor(
  value: string | undefined,
  storeId: string,
): Readonly<DatabaseDraftCursor> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    draftCursorFail();
  }
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) draftCursorFail();
    const parsed = JSON.parse(decoded.toString("utf8")) as Record<string, unknown>;
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !== "binding,id,updatedAt,version" ||
      parsed.version !== 1 ||
      typeof parsed.binding !== "string" || !/^[a-f0-9]{64}$/.test(parsed.binding) ||
      typeof parsed.id !== "string" || !ORDER_UUID.test(parsed.id)
    ) draftCursorFail();
    const cursor = Object.freeze({
      updatedAt: draftCursorTimestamp(parsed.updatedAt),
      id: parsed.id,
    });
    if (parsed.binding !== draftCursorBinding(storeId, cursor)) draftCursorFail();
    return cursor;
  } catch (error) {
    if (error instanceof OrderRepositoryError) throw error;
    draftCursorFail();
  }
}
