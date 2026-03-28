import { createServerClient } from "@/lib/supabase";

export const COUPON_METADATA_SETTINGS_KEY = "coupon_metadata";

export type DiscountScope = "all" | "products" | "collections" | "customers";
export type DiscountVisibility = "public" | "private" | "password";
export type DiscountLimitType = "once" | "once_per_customer" | "unlimited";

export type CouponMetadata = {
  name?: string;
  description?: string;
  scope?: DiscountScope;
  visibility?: DiscountVisibility;
  password?: string | null;
  limitType?: DiscountLimitType;
  tags?: string[];
  notes?: string | null;
};

export type CouponMetadataMap = Record<string, CouponMetadata>;

type CouponRow = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  min_order: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string | null;
};

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

export async function getCouponMetadataMap(
  serverClient: ReturnType<typeof createServerClient>
): Promise<CouponMetadataMap> {
  const { data } = await serverClient
    .from("settings")
    .select("value")
    .eq("key", COUPON_METADATA_SETTINGS_KEY)
    .single();

  const raw = data?.value as unknown;
  if (!raw || typeof raw !== "object") return {};

  const map = raw as Record<string, unknown>;
  const normalized: CouponMetadataMap = {};

  for (const [couponId, value] of Object.entries(map)) {
    if (!value || typeof value !== "object") continue;

    const item = value as Record<string, unknown>;
    normalized[couponId] = {
      name: item.name ? String(item.name) : undefined,
      description: item.description ? String(item.description) : undefined,
      scope: (item.scope as DiscountScope) || "all",
      visibility: (item.visibility as DiscountVisibility) || "public",
      password: item.password ? String(item.password) : null,
      limitType: (item.limitType as DiscountLimitType) || "unlimited",
      tags: safeArray(item.tags),
      notes: item.notes ? String(item.notes) : null,
    };
  }

  return normalized;
}

export async function saveCouponMetadataMap(
  serverClient: ReturnType<typeof createServerClient>,
  map: CouponMetadataMap
) {
  const { error } = await serverClient
    .from("settings")
    .upsert(
      {
        key: COUPON_METADATA_SETTINGS_KEY,
        value: map,
      },
      { onConflict: "key" }
    );

  if (error) throw error;
}

export function deriveDiscountStatus(coupon: CouponRow): "active" | "scheduled" | "expired" | "draft" {
  const now = Date.now();

  if (!coupon.is_active) return "draft";
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return "scheduled";
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) return "expired";
  return "active";
}

export function mergeCouponWithMetadata(coupon: CouponRow, metadata?: CouponMetadata) {
  const status = deriveDiscountStatus(coupon);
  const limitType = metadata?.limitType || (coupon.max_uses ? "once" : "unlimited");

  return {
    id: coupon.id,
    name: metadata?.name || coupon.code,
    description: metadata?.description || "",
    code: coupon.code,
    type: coupon.type,
    status,
    value: Number(coupon.value) || 0,
    minOrder: Number(coupon.min_order) || 0,
    maxUses: coupon.max_uses,
    usedCount: Number(coupon.used_count) || 0,
    startsAt: coupon.starts_at,
    expiresAt: coupon.expires_at,
    isActive: coupon.is_active,
    scope: metadata?.scope || "all",
    visibility: metadata?.visibility || "public",
    password: metadata?.password || "",
    limitType,
    tags: metadata?.tags || [],
    notes: metadata?.notes || "",
    createdAt: coupon.created_at,
  };
}

