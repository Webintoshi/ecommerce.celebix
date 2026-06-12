import { createHash, createHmac, timingSafeEqual } from "crypto";
import type {
  MarketplacePulledOrder,
  MarketplaceProviderAdapterResult,
} from "@/types/marketplace";
import { ProviderApiError, parseNumber, toRecord } from "@/lib/marketplace/runtime";

export function encodeBasicAuth(username: string, password: string) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

export function buildSuccessResult(
  message: string,
  raw?: Record<string, unknown>,
): MarketplaceProviderAdapterResult {
  return {
    success: true,
    message,
    raw,
  };
}

export function buildFailureResult(
  message: string,
  raw?: Record<string, unknown>,
): MarketplaceProviderAdapterResult {
  return {
    success: false,
    message,
    raw,
  };
}

export function extractSafeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeWebhookHmacHex(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyHexSignature(signature: string, expectedHex: string) {
  const normalizedSignature = signature.trim().toLowerCase().replace(/^sha256=/, "");
  const normalizedExpected = expectedHex.trim().toLowerCase();
  if (!normalizedSignature || normalizedSignature.length !== normalizedExpected.length) {
    return false;
  }

  const left = Buffer.from(normalizedSignature);
  const right = Buffer.from(normalizedExpected);
  return timingSafeEqual(left, right);
}

export function verifyBasicAuthHeader(input: {
  authorizationHeader: string | null | undefined;
  expectedUsername: string;
  expectedPassword: string;
}) {
  if (!input.authorizationHeader || !input.authorizationHeader.toLowerCase().startsWith("basic ")) {
    return false;
  }

  const token = input.authorizationHeader.slice(6).trim();
  let decoded = "";
  try {
    decoded = Buffer.from(token, "base64").toString("utf8");
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex <= 0) return false;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return username === input.expectedUsername && password === input.expectedPassword;
}

export function createDeterministicExternalId(parts: Array<string | null | undefined>) {
  const serialized = parts.map((part) => String(part || "")).join(":");
  return createHash("sha256").update(serialized).digest("hex").slice(0, 32);
}

export function normalizeProviderError(error: unknown) {
  if (error instanceof ProviderApiError) {
    const code = error.code ? ` (${error.code})` : "";
    const status = error.status > 0 ? ` [${error.status}]` : "";
    return `${error.message}${status}${code}`.trim();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Bilinmeyen pazaryeri hatasi.";
}

export function mapInternalStatusToMarketplace(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "pending") return "Created";
  if (normalized === "confirmed" || normalized === "preparing" || normalized === "processing") {
    return "Processing";
  }
  if (normalized === "shipped") return "Shipped";
  if (normalized === "delivered") return "Delivered";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "refunded") return "Returned";
  return "Processing";
}

export function buildPulledOrder(input: {
  externalOrderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  customer: MarketplacePulledOrder["customer"];
  shippingAddress: Record<string, unknown>;
  items: MarketplacePulledOrder["items"];
  raw: Record<string, unknown>;
  notes?: string | null;
}): MarketplacePulledOrder {
  return {
    externalOrderId: input.externalOrderId,
    orderNumber: input.orderNumber,
    status: input.status,
    paymentStatus: input.paymentStatus,
    createdAt: input.createdAt,
    notes: input.notes || null,
    customer: input.customer,
    shippingAddress: input.shippingAddress,
    items: input.items,
    raw: input.raw,
  };
}

export function toOrderItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toRecord(item));
}

export function resolveUnitPrice(item: Record<string, unknown>) {
  return parseNumber(
    item.price ?? item.unitPrice ?? item.amount ?? item.totalPrice,
    0,
  );
}
