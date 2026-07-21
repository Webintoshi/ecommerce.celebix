import type { QuickOrderLinkListItem, QuickOrderLinkStatus } from "@celebix/saas-contracts";

import { quickOrderFingerprint } from "./canonical.ts";
import { QuickOrderLinkRepositoryError } from "./errors.ts";
import { exactQuickLinkInput, QUICK_LINK_UUID } from "./validation.ts";

interface QuickLinkCursor {
  readonly version: 1;
  readonly binding: string;
  readonly status: QuickOrderLinkStatus | null;
  readonly createdAt: string;
  readonly id: string;
}

export interface DatabaseQuickLinkCursor {
  readonly createdAt: string;
  readonly id: string;
}

const SIX_DIGIT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function fail(): never {
  throw new QuickOrderLinkRepositoryError("invalid_input");
}

export function normalizeQuickLinkTimestamp(value: string): string {
  return value.replace(/\.(\d{3})Z$/, ".$1000Z");
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !SIX_DIGIT_TIMESTAMP.test(value)) fail();
  const parsed = new Date(value);
  const millisecondCanonical = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== millisecondCanonical) fail();
  return value;
}

function binding(
  storeId: string,
  status: QuickOrderLinkStatus | undefined,
  cursor: DatabaseQuickLinkCursor,
): string {
  return quickOrderFingerprint("list_cursor", storeId, {
    status: status ?? null,
    createdAt: cursor.createdAt,
    id: cursor.id,
  });
}

export function parseQuickLinkDatabaseCursor(
  value: unknown,
  lastItem: Readonly<QuickOrderLinkListItem>,
): DatabaseQuickLinkCursor {
  const parsed = exactQuickLinkInput(value, ["createdAt", "id"]);
  const createdAt = timestamp(parsed.createdAt);
  if (
    typeof parsed.id !== "string" ||
    !QUICK_LINK_UUID.test(parsed.id) ||
    parsed.id !== lastItem.id ||
    createdAt !== normalizeQuickLinkTimestamp(lastItem.createdAt)
  ) fail();
  return Object.freeze({ createdAt, id: parsed.id });
}

export function encodeQuickLinkCursor(
  storeId: string,
  status: QuickOrderLinkStatus | undefined,
  cursor: DatabaseQuickLinkCursor,
): string {
  return Buffer.from(JSON.stringify({
    version: 1,
    binding: binding(storeId, status, cursor),
    status: status ?? null,
    createdAt: cursor.createdAt,
    id: cursor.id,
  } satisfies QuickLinkCursor), "utf8").toString("base64url");
}

export function decodeQuickLinkCursor(
  value: string | undefined,
  storeId: string,
  status: QuickOrderLinkStatus | undefined,
): QuickLinkCursor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) fail();
    const parsed = exactQuickLinkInput(JSON.parse(decoded.toString("utf8")), [
      "version", "binding", "status", "createdAt", "id",
    ]);
    if (
      parsed.version !== 1 ||
      parsed.status !== (status ?? null) ||
      typeof parsed.binding !== "string" || !/^[a-f0-9]{64}$/.test(parsed.binding) ||
      typeof parsed.id !== "string" || !QUICK_LINK_UUID.test(parsed.id)
    ) fail();
    const cursor = Object.freeze({ createdAt: timestamp(parsed.createdAt), id: parsed.id });
    if (parsed.binding !== binding(storeId, status, cursor)) fail();
    return Object.freeze({
      version: 1,
      binding: parsed.binding,
      status: status ?? null,
      createdAt: cursor.createdAt,
      id: cursor.id,
    });
  } catch (error) {
    if (error instanceof QuickOrderLinkRepositoryError) throw error;
    return fail();
  }
}
