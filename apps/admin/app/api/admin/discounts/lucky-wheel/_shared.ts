import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";

export const luckyWheelConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  is_active: z.boolean(),
  start_date: z.string().nullable().optional().default(null),
  end_date: z.string().nullable().optional().default(null),
  max_total_spins: z.number().int().min(1),
  max_spins_per_user: z.number().int().min(1),
  cooldown_hours: z.number().int().min(0),
  probability_mode: z.enum(["percentage", "weight"]),
  require_membership: z.boolean().default(false),
  require_email_verified: z.boolean().default(false),
  wheel_segments: z.number().int().min(2).max(24),
  primary_color: z.string().trim().min(4).max(20),
  secondary_color: z.string().trim().min(4).max(20),
});

export const luckyWheelPrizeSchema = z.object({
  id: z.string().uuid().optional(),
  config_id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).nullable().optional().default(null),
  prize_type: z.enum(["coupon", "none"]),
  probability_value: z.number().min(0),
  stock_total: z.number().int().min(0),
  stock_remaining: z.number().int().min(0).optional(),
  is_unlimited_stock: z.boolean().default(false),
  color_hex: z.string().trim().min(4).max(20),
  icon_emoji: z.string().trim().max(10).nullable().optional().default(null),
  image_url: z.string().trim().max(500).nullable().optional().default(null),
  display_order: z.number().int().min(1),
  is_active: z.boolean().default(true),
  coupon_prefix: z.string().trim().max(16).nullable().optional().default(null),
  coupon_type: z.enum(["percentage", "fixed"]).nullable().optional().default("percentage"),
  coupon_value: z.number().min(0).nullable().optional().default(10),
  coupon_min_order: z.number().min(0).nullable().optional().default(0),
  coupon_validity_hours: z.number().int().min(1).max(24 * 365).nullable().optional().default(168),
});

export const luckyWheelPrizesReplaceSchema = z.object({
  configId: z.string().uuid().optional(),
  prizes: z.array(luckyWheelPrizeSchema).max(200),
});

export const luckyWheelPrizeUpdateSchema = z.object({
  configId: z.string().uuid().optional(),
  prize: luckyWheelPrizeSchema,
});

export const luckyWheelPrizeCreateSchema = z.object({
  configId: z.string().uuid().optional(),
  prize: luckyWheelPrizeSchema.omit({ id: true }),
});

export const luckyWheelSimulateSchema = z.object({
  configId: z.string().uuid().optional(),
  spinCount: z.number().int().min(10).max(50000).optional().default(1000),
});

export function enforceLuckyWheelAdminRateLimit(
  request: NextRequest,
  suffix: string,
  limit = 30,
  windowMs = 60_000,
) {
  const ip = getRequestIp(request);
  const result = checkRateLimit({
    key: `admin:lucky-wheel:${suffix}:${ip}`,
    limit,
    windowMs,
  });

  if (result.allowed) return null;

  return NextResponse.json(
    {
      success: false,
      error: "Rate limit asildi. Lutfen biraz sonra tekrar deneyin.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
      },
    },
  );
}
