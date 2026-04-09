export type LuckyWheelProbabilityMode = "percentage" | "weight";
export type LuckyWheelPrizeType = "coupon" | "none";
export type LuckyWheelCouponType = "percentage" | "fixed";

export interface LuckyWheelConfig {
  id: string;
  name: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  max_total_spins: number;
  max_spins_per_user: number;
  cooldown_hours: number;
  probability_mode: LuckyWheelProbabilityMode;
  require_membership: boolean;
  require_email_verified: boolean;
  wheel_segments: number;
  primary_color: string;
  secondary_color: string;
  created_at: string;
  updated_at: string;
}

export interface LuckyWheelPrize {
  id: string;
  config_id: string;
  name: string;
  description: string | null;
  prize_type: LuckyWheelPrizeType;
  probability_value: number;
  stock_total: number;
  stock_remaining: number;
  is_unlimited_stock: boolean;
  color_hex: string;
  icon_emoji: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  coupon_prefix: string | null;
  coupon_type: LuckyWheelCouponType | null;
  coupon_value: number | null;
  coupon_min_order: number | null;
  coupon_validity_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface LuckyWheelSpin {
  id: string;
  config_id: string | null;
  prize_id: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_name: string | null;
  fingerprint_hash: string | null;
  request_ip: string | null;
  request_user_agent: string | null;
  idempotency_key: string | null;
  is_winner: boolean;
  prize_name: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
  spin_number: number | null;
  spin_result: Record<string, unknown> | null;
  created_at: string;
}

export interface LuckyWheelPublicConfig {
  id: string;
  name: string;
  is_active: boolean;
  wheel_segments: number;
  primary_color: string;
  secondary_color: string;
  require_membership: boolean;
  require_email_verified: boolean;
  start_date: string | null;
  end_date: string | null;
}

export interface LuckyWheelPublicPrize {
  id: string;
  name: string;
  description: string | null;
  prize_type: LuckyWheelPrizeType;
  color_hex: string;
  icon_emoji: string | null;
  image_url: string | null;
  display_order: number;
}

export interface LuckyWheelEligibilityRequest {
  configId?: string;
  userEmail?: string;
  userPhone?: string;
  fingerprint: string;
}

export interface LuckyWheelEligibilityResult {
  canSpin: boolean;
  reason?: string;
  remainingCooldownHours?: number;
  spinsRemaining: number;
}

export interface LuckyWheelSpinRequest {
  configId?: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  fingerprint: string;
  idempotencyKey: string;
  requestIp: string;
  requestUserAgent?: string;
}

export interface LuckyWheelSpinResult {
  success: boolean;
  canSpin: boolean;
  message: string;
  remainingSpins: number;
  spin: LuckyWheelSpin | null;
  prize: LuckyWheelPrize | null;
  couponCode: string | null;
}

export interface LuckyWheelStats {
  totalSpins: number;
  uniqueUsers: number;
  winners: number;
  winRate: number;
  prizeDistribution: Array<{
    prizeName: string;
    count: number;
    percentage: number;
  }>;
  recentSpins: LuckyWheelSpin[];
  dailySpins: Array<{
    date: string;
    count: number;
  }>;
}

export interface LuckyWheelSimulationResult {
  totalSpins: number;
  prizeResults: Array<{
    prizeName: string;
    won: number;
    expected: number;
    difference: number;
  }>;
  winnerRate: number;
}
