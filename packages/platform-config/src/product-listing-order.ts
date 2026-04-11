export const PRODUCT_LISTING_ORDER_SETTING_KEY = "product_listing_order";

export interface ProductListingOrderSettings {
  positions: Record<string, number>;
  updatedAt?: string;
}

type ManualOrderSortableRecord = {
  id: string;
  created_at?: string | null;
  createdAt?: string | null;
  name?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePositionValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeProductListingOrderSettings(
  value: unknown,
): ProductListingOrderSettings {
  if (!isRecord(value)) {
    return { positions: {} };
  }

  const rawPositions = isRecord(value.positions) ? value.positions : {};
  const positions: Record<string, number> = {};

  for (const [productId, rawPosition] of Object.entries(rawPositions)) {
    const normalizedPosition = normalizePositionValue(rawPosition);
    if (!productId || normalizedPosition === null) {
      continue;
    }

    positions[productId] = normalizedPosition;
  }

  return {
    positions,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.trim().length > 0
        ? value.updatedAt
        : undefined,
  };
}

export function sortProductsByListingOrder<T extends ManualOrderSortableRecord>(
  records: T[],
  positions: Record<string, number>,
): T[] {
  return [...records].sort((left, right) => {
    const leftPosition =
      typeof positions[left.id] === "number" ? positions[left.id] : Number.MAX_SAFE_INTEGER;
    const rightPosition =
      typeof positions[right.id] === "number" ? positions[right.id] : Number.MAX_SAFE_INTEGER;

    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }

    const timestampDiff =
      toTimestamp(right.created_at ?? right.createdAt) -
      toTimestamp(left.created_at ?? left.createdAt);

    if (timestampDiff !== 0) {
      return timestampDiff;
    }

    return String(left.name ?? "").localeCompare(String(right.name ?? ""), "tr");
  });
}

export function buildSequentialProductListingPositions(
  orderedProductIds: string[],
  step = 10,
): Record<string, number> {
  const safeStep = Math.max(1, Math.round(step));
  const positions: Record<string, number> = {};

  orderedProductIds.forEach((productId, index) => {
    if (!productId) {
      return;
    }

    positions[productId] = (index + 1) * safeStep;
  });

  return positions;
}
