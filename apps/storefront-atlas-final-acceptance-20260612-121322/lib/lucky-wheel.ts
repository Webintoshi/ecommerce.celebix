import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import type {
  LuckyWheelConfig,
  LuckyWheelEligibilityRequest,
  LuckyWheelEligibilityResult,
  LuckyWheelPrize,
  LuckyWheelSimulationResult,
  LuckyWheelSpin,
  LuckyWheelSpinRequest,
  LuckyWheelSpinResult,
  LuckyWheelStats,
} from "@/types/lucky-wheel";

export const DEFAULT_LUCKY_WHEEL_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

type SpinRpcRow = {
  success: boolean;
  can_spin: boolean;
  message: string;
  remaining_spins: number;
  spin_id: string | null;
  prize_id: string | null;
  prize_name: string | null;
  is_winner: boolean;
  coupon_id: string | null;
  coupon_code: string | null;
  spin_created_at: string | null;
};

export type LuckyWheelConfigInput = {
  id?: string;
  name: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  max_total_spins: number;
  max_spins_per_user: number;
  cooldown_hours: number;
  probability_mode: "percentage" | "weight";
  require_membership: boolean;
  require_email_verified: boolean;
  wheel_segments: number;
  primary_color: string;
  secondary_color: string;
};

export type LuckyWheelPrizeInput = {
  id?: string;
  config_id?: string;
  name: string;
  description?: string | null;
  prize_type: "coupon" | "none";
  probability_value: number;
  stock_total: number;
  stock_remaining?: number;
  is_unlimited_stock: boolean;
  color_hex: string;
  icon_emoji?: string | null;
  image_url?: string | null;
  display_order: number;
  is_active: boolean;
  coupon_prefix?: string | null;
  coupon_type?: "percentage" | "fixed" | null;
  coupon_value?: number | null;
  coupon_min_order?: number | null;
  coupon_validity_hours?: number | null;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateOnlyToIso(value: string | null | undefined, endOfDay = false): string | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeCodePart(value: string | null | undefined, fallback: string): string {
  const normalized = (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16);
  return normalized || fallback;
}

export function hashLuckyWheelFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeLuckyWheelEmail(value?: string): string | undefined {
  const trimmed = (value || "").trim().toLowerCase();
  return trimmed || undefined;
}

export function normalizeLuckyWheelPhone(value?: string): string | undefined {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("90") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `9${digits}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

async function getConfigById(configId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("lucky_wheel_configs")
    .select("*")
    .eq("id", configId)
    .maybeSingle();

  if (error) throw error;
  return (data as LuckyWheelConfig | null) || null;
}

async function getFirstConfig() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("lucky_wheel_configs")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LuckyWheelConfig | null) || null;
}

export async function getLuckyWheelAdminConfig(configId = DEFAULT_LUCKY_WHEEL_CONFIG_ID): Promise<LuckyWheelConfig | null> {
  const direct = await getConfigById(configId);
  if (direct) return direct;
  return getFirstConfig();
}

export async function getActiveLuckyWheelConfig(): Promise<LuckyWheelConfig | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("lucky_wheel_configs")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LuckyWheelConfig | null) || null;
}

export async function listLuckyWheelPrizes(configId: string): Promise<LuckyWheelPrize[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("lucky_wheel_prizes")
    .select("*")
    .eq("config_id", configId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data || []) as LuckyWheelPrize[];
}

function normalizePrizeInput(prize: LuckyWheelPrizeInput, index: number, configId: string) {
  const prizeType = prize.prize_type === "none" ? "none" : "coupon";
  const isUnlimitedStock = Boolean(prize.is_unlimited_stock);
  const stockTotal = Math.max(0, Math.floor(toNumber(prize.stock_total)));
  const stockRemaining = isUnlimitedStock
    ? stockTotal
    : Math.max(0, Math.floor(toNumber(prize.stock_remaining, stockTotal)));
  const couponType = prizeType === "coupon" ? (prize.coupon_type === "fixed" ? "fixed" : "percentage") : "percentage";
  const couponValueRaw = toNumber(prize.coupon_value, prizeType === "coupon" ? 10 : 0);
  const couponValue = couponType === "percentage" ? Math.min(100, Math.max(0.01, couponValueRaw)) : Math.max(0.01, couponValueRaw);

  return {
    id: prize.id,
    config_id: configId,
    name: (prize.name || "").trim(),
    description: (prize.description || "").trim() || null,
    prize_type: prizeType,
    probability_value: Math.max(0, toNumber(prize.probability_value)),
    stock_total: stockTotal,
    stock_remaining: stockRemaining,
    is_unlimited_stock: isUnlimitedStock,
    color_hex: prize.color_hex || "#ffffff",
    icon_emoji: (prize.icon_emoji || "").trim() || null,
    image_url: (prize.image_url || "").trim() || null,
    display_order: Number.isFinite(prize.display_order) ? prize.display_order : index + 1,
    is_active: prize.is_active !== false,
    coupon_prefix: prizeType === "coupon" ? normalizeCodePart(prize.coupon_prefix || null, "LUCKY") : null,
    coupon_type: prizeType === "coupon" ? couponType : null,
    coupon_value: prizeType === "coupon" ? couponValue : null,
    coupon_min_order: prizeType === "coupon" ? Math.max(0, toNumber(prize.coupon_min_order, 0)) : null,
    coupon_validity_hours: prizeType === "coupon" ? Math.max(1, Math.floor(toNumber(prize.coupon_validity_hours, 168))) : null,
  };
}

async function ensurePublishProbability(configId: string, probabilityMode: "percentage" | "weight", isActive: boolean) {
  if (!isActive || probabilityMode !== "percentage") return;
  const prizes = await listLuckyWheelPrizes(configId);
  const activePrizes = prizes.filter((item) => item.is_active);
  if (activePrizes.length === 0) {
    throw new Error("Aktif kampanya için en az bir aktif ödül gerekli.");
  }

  const probabilityTotal = activePrizes.reduce((sum, item) => sum + toNumber(item.probability_value), 0);
  if (Math.abs(probabilityTotal - 100) > 0.001) {
    throw new Error("Yüzde modunda aktif ödüllerin olasılık toplamı 100 olmalıdır.");
  }
}

export async function saveLuckyWheelConfig(input: LuckyWheelConfigInput): Promise<LuckyWheelConfig> {
  const supabase = createServerClient();
  const configId = input.id || DEFAULT_LUCKY_WHEEL_CONFIG_ID;

  const startAt = parseDateOnlyToIso(input.start_date);
  const endAt = parseDateOnlyToIso(input.end_date, true);
  if (startAt && endAt && new Date(startAt) >= new Date(endAt)) {
    throw new Error("Bitiş tarihi başlangıç tarihinden sonra olmalı.");
  }

  await ensurePublishProbability(configId, input.probability_mode, input.is_active);

  const payload = {
    id: configId,
    name: input.name.trim(),
    is_active: Boolean(input.is_active),
    start_date: startAt,
    end_date: endAt,
    max_total_spins: Math.max(1, Math.floor(toNumber(input.max_total_spins, 1000))),
    max_spins_per_user: Math.max(1, Math.floor(toNumber(input.max_spins_per_user, 1))),
    cooldown_hours: Math.max(0, Math.floor(toNumber(input.cooldown_hours, 24))),
    probability_mode: input.probability_mode === "weight" ? "weight" : "percentage",
    require_membership: Boolean(input.require_membership),
    require_email_verified: Boolean(input.require_email_verified),
    wheel_segments: Math.max(2, Math.floor(toNumber(input.wheel_segments, 8))),
    primary_color: input.primary_color || "#FF6B35",
    secondary_color: input.secondary_color || "#FFE66D",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("lucky_wheel_configs")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as LuckyWheelConfig;
}

export async function replaceLuckyWheelPrizes(configId: string, prizes: LuckyWheelPrizeInput[]): Promise<LuckyWheelPrize[]> {
  const supabase = createServerClient();
  const normalized = prizes.map((item, index) => normalizePrizeInput(item, index, configId));
  for (const prize of normalized) {
    if (!prize.name || prize.name.length < 2) {
      throw new Error("Ödül adı en az 2 karakter olmalı.");
    }
  }

  const { error: deleteError } = await supabase.from("lucky_wheel_prizes").delete().eq("config_id", configId);
  if (deleteError) throw deleteError;

  if (normalized.length === 0) return [];

  const { data, error } = await supabase.from("lucky_wheel_prizes").insert(normalized).select("*");
  if (error) throw error;
  return (data || []) as LuckyWheelPrize[];
}

export async function createLuckyWheelPrize(configId: string, input: LuckyWheelPrizeInput): Promise<LuckyWheelPrize> {
  const supabase = createServerClient();
  const normalized = normalizePrizeInput(input, input.display_order || 0, configId);
  const { data, error } = await supabase.from("lucky_wheel_prizes").insert(normalized).select("*").single();
  if (error) throw error;
  return data as LuckyWheelPrize;
}

export async function updateLuckyWheelPrize(configId: string, input: LuckyWheelPrizeInput): Promise<LuckyWheelPrize> {
  if (!input.id) throw new Error("Güncellenecek ödül id'si gerekli.");
  const supabase = createServerClient();
  const normalized = normalizePrizeInput(input, input.display_order || 0, configId);
  const { data, error } = await supabase
    .from("lucky_wheel_prizes")
    .update({
      name: normalized.name,
      description: normalized.description,
      prize_type: normalized.prize_type,
      probability_value: normalized.probability_value,
      stock_total: normalized.stock_total,
      stock_remaining: normalized.stock_remaining,
      is_unlimited_stock: normalized.is_unlimited_stock,
      color_hex: normalized.color_hex,
      icon_emoji: normalized.icon_emoji,
      image_url: normalized.image_url,
      display_order: normalized.display_order,
      is_active: normalized.is_active,
      coupon_prefix: normalized.coupon_prefix,
      coupon_type: normalized.coupon_type,
      coupon_value: normalized.coupon_value,
      coupon_min_order: normalized.coupon_min_order,
      coupon_validity_hours: normalized.coupon_validity_hours,
    })
    .eq("id", input.id)
    .eq("config_id", configId)
    .select("*")
    .single();
  if (error) throw error;
  return data as LuckyWheelPrize;
}

export async function deleteLuckyWheelPrize(configId: string, prizeId: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from("lucky_wheel_prizes").delete().eq("id", prizeId).eq("config_id", configId);
  if (error) throw error;
}

function buildLuckyWheelStats(spins: LuckyWheelSpin[]): LuckyWheelStats {
  const totalSpins = spins.length;
  const winners = spins.filter((spin) => spin.is_winner).length;
  const uniqueUsers = new Set<string>();
  const prizeCounter = new Map<string, number>();
  const dayCounter = new Map<string, number>();

  for (const spin of spins) {
    if (spin.user_email) uniqueUsers.add(`email:${spin.user_email}`);
    if (spin.user_phone) uniqueUsers.add(`phone:${spin.user_phone}`);
    if (!spin.user_email && !spin.user_phone && spin.fingerprint_hash) uniqueUsers.add(`fp:${spin.fingerprint_hash}`);

    if (spin.prize_name) {
      prizeCounter.set(spin.prize_name, (prizeCounter.get(spin.prize_name) || 0) + 1);
    }

    const date = new Date(spin.created_at).toISOString().slice(0, 10);
    dayCounter.set(date, (dayCounter.get(date) || 0) + 1);
  }

  const prizeDistribution = Array.from(prizeCounter.entries()).map(([prizeName, count]) => ({
    prizeName,
    count,
    percentage: totalSpins > 0 ? (count / totalSpins) * 100 : 0,
  }));

  const dailySpins = Array.from(dayCounter.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  return {
    totalSpins,
    uniqueUsers: uniqueUsers.size,
    winners,
    winRate: totalSpins > 0 ? (winners / totalSpins) * 100 : 0,
    prizeDistribution,
    recentSpins: spins.slice(0, 30),
    dailySpins,
  };
}

export async function listLuckyWheelSpins(configId: string, limit = 100): Promise<{ spins: LuckyWheelSpin[]; stats: LuckyWheelStats }> {
  const supabase = createServerClient();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await supabase
    .from("lucky_wheel_spins")
    .select("*")
    .eq("config_id", configId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  const spins = (data || []) as LuckyWheelSpin[];
  return {
    spins,
    stats: buildLuckyWheelStats(spins),
  };
}

export async function simulateLuckyWheel(configId: string, spinCount = 1000): Promise<LuckyWheelSimulationResult> {
  const config = await getConfigById(configId);
  if (!config) {
    throw new Error("Lucky Wheel konfigürasyonu bulunamadı.");
  }

  const prizes = (await listLuckyWheelPrizes(configId)).filter(
    (item) => item.is_active && (item.is_unlimited_stock || item.stock_remaining > 0),
  );
  if (prizes.length === 0) {
    throw new Error("Simülasyon için aktif ödül bulunamadı.");
  }

  const counters = new Map<string, number>();
  let winnerCount = 0;
  for (let i = 0; i < spinCount; i += 1) {
    const winner = pickPrize(prizes, config.probability_mode);
    counters.set(winner.name, (counters.get(winner.name) || 0) + 1);
    if (winner.prize_type === "coupon") winnerCount += 1;
  }

  return {
    totalSpins: spinCount,
    prizeResults: prizes.map((prize) => {
      const won = counters.get(prize.name) || 0;
      return {
        prizeName: prize.name,
        won,
        expected: toNumber(prize.probability_value),
        difference: won - (spinCount * toNumber(prize.probability_value)) / 100,
      };
    }),
    winnerRate: spinCount > 0 ? (winnerCount / spinCount) * 100 : 0,
  };
}

function pickPrize(prizes: LuckyWheelPrize[], mode: "percentage" | "weight") {
  if (prizes.length === 1) return prizes[0];
  const weights = prizes.map((prize) => {
    const val = toNumber(prize.probability_value, 0);
    return mode === "weight" ? Math.max(0.0001, val || 1) : Math.max(0, val);
  });
  const total = weights.reduce((sum, item) => sum + item, 0);
  const safeTotal = total > 0 ? total : prizes.length;
  const random = Math.random() * safeTotal;
  let cumulative = 0;

  for (let index = 0; index < prizes.length; index += 1) {
    const step = total > 0 ? weights[index] : 1;
    cumulative += step;
    if (random <= cumulative) return prizes[index];
  }

  return prizes[prizes.length - 1];
}

async function countSpinsByColumn(configId: string, column: "user_email" | "user_phone" | "fingerprint_hash", value: string) {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("lucky_wheel_spins")
    .select("id", { count: "exact", head: true })
    .eq("config_id", configId)
    .eq(column, value);
  if (error) throw error;
  return count || 0;
}

async function getLatestSpinDate(configId: string, column: "user_email" | "user_phone" | "fingerprint_hash", value: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("lucky_wheel_spins")
    .select("created_at")
    .eq("config_id", configId)
    .eq(column, value)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ? new Date(data.created_at) : null;
}

export async function checkLuckyWheelEligibility(input: LuckyWheelEligibilityRequest): Promise<LuckyWheelEligibilityResult> {
  const config = input.configId ? await getConfigById(input.configId) : await getActiveLuckyWheelConfig();
  if (!config) {
    return { canSpin: false, reason: "Aktif şans çarkı bulunamadı.", spinsRemaining: 0 };
  }

  if (!config.is_active) {
    return { canSpin: false, reason: "Şans çarkı aktif değil.", spinsRemaining: 0 };
  }

  const now = new Date();
  if (config.start_date && new Date(config.start_date) > now) {
    return { canSpin: false, reason: "Şans çarkı henüz başlamadı.", spinsRemaining: 0 };
  }
  if (config.end_date && new Date(config.end_date) < now) {
    return { canSpin: false, reason: "Şans çarkı sona erdi.", spinsRemaining: 0 };
  }

  const supabase = createServerClient();
  const { count: totalSpins, error: totalError } = await supabase
    .from("lucky_wheel_spins")
    .select("id", { count: "exact", head: true })
    .eq("config_id", config.id);
  if (totalError) throw totalError;
  if ((totalSpins || 0) >= config.max_total_spins) {
    return { canSpin: false, reason: "Toplam spin limiti doldu.", spinsRemaining: 0 };
  }

  const email = normalizeLuckyWheelEmail(input.userEmail);
  const phone = normalizeLuckyWheelPhone(input.userPhone);
  const fingerprintHash = hashLuckyWheelFingerprint(input.fingerprint);

  const counts = await Promise.all([
    email ? countSpinsByColumn(config.id, "user_email", email) : Promise.resolve(0),
    phone ? countSpinsByColumn(config.id, "user_phone", phone) : Promise.resolve(0),
    countSpinsByColumn(config.id, "fingerprint_hash", fingerprintHash),
  ]);

  const maxUsed = Math.max(...counts);
  if (maxUsed >= config.max_spins_per_user) {
    return { canSpin: false, reason: "Spin hakkınız tükenmiş.", spinsRemaining: 0 };
  }

  if (config.cooldown_hours > 0) {
    const latestDates = await Promise.all([
      email ? getLatestSpinDate(config.id, "user_email", email) : Promise.resolve(null),
      phone ? getLatestSpinDate(config.id, "user_phone", phone) : Promise.resolve(null),
      getLatestSpinDate(config.id, "fingerprint_hash", fingerprintHash),
    ]);
    const latest = latestDates
      .filter((item): item is Date => item instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (latest) {
      const cooldownEndsAt = new Date(latest.getTime() + config.cooldown_hours * 60 * 60 * 1000);
      if (cooldownEndsAt > now) {
        const remainingCooldownHours = Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        return {
          canSpin: false,
          reason: `${remainingCooldownHours} saat sonra tekrar deneyebilirsiniz.`,
          remainingCooldownHours,
          spinsRemaining: 0,
        };
      }
    }
  }

  return {
    canSpin: true,
    spinsRemaining: Math.max(0, config.max_spins_per_user - maxUsed),
  };
}

export async function spinLuckyWheel(request: LuckyWheelSpinRequest): Promise<LuckyWheelSpinResult> {
  const supabase = createServerClient();
  const config = request.configId ? await getConfigById(request.configId) : await getActiveLuckyWheelConfig();
  if (!config) {
    return {
      success: false,
      canSpin: false,
      message: "Aktif şans çarkı bulunamadı.",
      remainingSpins: 0,
      spin: null,
      prize: null,
      couponCode: null,
    };
  }

  const userEmail = normalizeLuckyWheelEmail(request.userEmail);
  const userPhone = normalizeLuckyWheelPhone(request.userPhone);
  const fingerprintHash = hashLuckyWheelFingerprint(request.fingerprint);

  const { data, error } = await supabase.rpc("perform_lucky_wheel_spin", {
    p_config_id: config.id,
    p_user_email: userEmail || null,
    p_user_phone: userPhone || null,
    p_user_name: request.userName.trim(),
    p_fingerprint_hash: fingerprintHash,
    p_request_ip: request.requestIp,
    p_request_user_agent: request.requestUserAgent || null,
    p_idempotency_key: request.idempotencyKey,
  });

  if (error) {
    throw error;
  }

  const row = ((data || [])[0] || null) as SpinRpcRow | null;
  if (!row) {
    return {
      success: false,
      canSpin: false,
      message: "Spin sonucu alınamadı.",
      remainingSpins: 0,
      spin: null,
      prize: null,
      couponCode: null,
    };
  }

  let spin: LuckyWheelSpin | null = null;
  let prize: LuckyWheelPrize | null = null;
  if (row.spin_id) {
    const { data: spinRow } = await supabase
      .from("lucky_wheel_spins")
      .select("*")
      .eq("id", row.spin_id)
      .maybeSingle();
    spin = (spinRow as LuckyWheelSpin | null) || null;
  }

  if (row.prize_id) {
    const { data: prizeRow } = await supabase
      .from("lucky_wheel_prizes")
      .select("*")
      .eq("id", row.prize_id)
      .maybeSingle();
    prize = (prizeRow as LuckyWheelPrize | null) || null;
  }

  return {
    success: Boolean(row.success),
    canSpin: Boolean(row.can_spin),
    message: row.message || "İşlem tamamlandı.",
    remainingSpins: Math.max(0, toNumber(row.remaining_spins, 0)),
    spin,
    prize,
    couponCode: row.coupon_code || null,
  };
}

export async function getLuckyWheelPublicData(configId?: string) {
  const config = configId ? await getConfigById(configId) : await getActiveLuckyWheelConfig();
  if (!config) return { config: null, prizes: [] as LuckyWheelPrize[] };

  const prizes = (await listLuckyWheelPrizes(config.id))
    .filter((item) => item.is_active)
    .sort((a, b) => a.display_order - b.display_order);

  return { config, prizes };
}
