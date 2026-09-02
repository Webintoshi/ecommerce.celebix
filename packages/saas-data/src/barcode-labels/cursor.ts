import { createHash } from "node:crypto";
import {
  barcodeLabelListQueryDigest,
  parseBarcodeLabelListQuery,
  type BarcodeLabelListQuery,
} from "@celebix/saas-contracts";
import { BarcodeLabelRepositoryError } from "./errors.ts";

export type BarcodeLabelCursorAnchor = Readonly<{
  sortNullRank: 0 | 1;
  sortValue: string | number;
  variantId: string;
}>;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = (): never => {
  throw new BarcodeLabelRepositoryError("invalid_input");
};
const digest = (query: BarcodeLabelListQuery) =>
  createHash("sha256")
    .update(barcodeLabelListQueryDigest(parseBarcodeLabelListQuery(query)))
    .digest("base64url");

export function encodeBarcodeLabelCursor(
  storeId: string,
  query: BarcodeLabelListQuery,
  anchor: BarcodeLabelCursorAnchor,
): string {
  if (
    !UUID.test(storeId) ||
    !UUID.test(anchor.variantId) ||
    ![0, 1].includes(anchor.sortNullRank) ||
    (typeof anchor.sortValue !== "string" &&
      (!Number.isSafeInteger(anchor.sortValue) || anchor.sortValue < 0)) ||
    (typeof anchor.sortValue === "string" && anchor.sortValue.length > 200)
  )
    fail();
  return Buffer.from(
    JSON.stringify([
      1,
      storeId,
      digest(query),
      anchor.sortNullRank,
      anchor.sortValue,
      anchor.variantId,
    ]),
    "utf8",
  ).toString("base64url");
}

export function decodeBarcodeLabelCursor(
  value: string | undefined,
  storeId: string,
  query: BarcodeLabelListQuery,
): BarcodeLabelCursorAnchor | undefined {
  if (value === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]{1,2048}$/.test(value)) fail();
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) fail();
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 6 ||
      parsed[0] !== 1 ||
      parsed[1] !== storeId ||
      parsed[2] !== digest(query)
    )
      fail();
    const anchor = {
      sortNullRank: parsed[3],
      sortValue: parsed[4],
      variantId: parsed[5],
    };
    if (
      ![0, 1].includes(anchor.sortNullRank) ||
      (query.sort === "stock-desc"
        ? !Number.isSafeInteger(anchor.sortValue) || anchor.sortValue < 0
        : typeof anchor.sortValue !== "string" || anchor.sortValue.length > 200) ||
      typeof anchor.variantId !== "string" ||
      !UUID.test(anchor.variantId)
    )
      fail();
    return Object.freeze(anchor as BarcodeLabelCursorAnchor);
  } catch (error) {
    if (error instanceof BarcodeLabelRepositoryError) throw error;
    fail();
  }
}
