export type ProductDiscountRuleType =
  | "buy_x_get_y"
  | "bulk"
  | "percentage"
  | "fixed";

export type ProductDiscountRuleConfig = {
  buy?: number | null;
  get?: number | null;
  minQty?: number | null;
  min_qty?: number | null;
  discountPercent?: number | null;
  discount_percent?: number | null;
  discountAmount?: number | null;
  discount_amount?: number | null;
};

export type ProductDiscountRule = {
  id?: string | null;
  type: ProductDiscountRuleType;
  config?: ProductDiscountRuleConfig | null;
  isActive?: boolean | null;
  is_active?: boolean | null;
  startsAt?: string | null;
  starts_at?: string | null;
  endsAt?: string | null;
  ends_at?: string | null;
  priority?: number | null;
};

export type VariantDisplayPricingInput = {
  price: number;
  originalPrice?: number | null;
};

export type VariantDisplayPricing = {
  price: number;
  originalPrice?: number;
  hasDiscount: boolean;
  discountPercent: number;
};

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePositiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function getRuleStartsAt(rule: ProductDiscountRule): number | null {
  const rawValue = rule.startsAt ?? rule.starts_at;
  if (!rawValue) return null;
  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getRuleEndsAt(rule: ProductDiscountRule): number | null {
  const rawValue = rule.endsAt ?? rule.ends_at;
  if (!rawValue) return null;
  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRuleActive(rule: ProductDiscountRule, now = Date.now()): boolean {
  const activeFlag = rule.isActive ?? rule.is_active ?? true;
  if (!activeFlag) {
    return false;
  }

  const startsAt = getRuleStartsAt(rule);
  if (startsAt && startsAt > now) {
    return false;
  }

  const endsAt = getRuleEndsAt(rule);
  if (endsAt && endsAt < now) {
    return false;
  }

  return true;
}

function getRuleMinQty(rule: ProductDiscountRule): number {
  const minQty = normalizePositiveNumber(rule.config?.minQty ?? rule.config?.min_qty);
  return minQty ?? 1;
}

function calculateRuleDiscountedPrice(basePrice: number, rule: ProductDiscountRule): number | null {
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return null;
  }

  switch (rule.type) {
    case "percentage": {
      const percent =
        normalizePositiveNumber(
          rule.config?.discountPercent ?? rule.config?.discount_percent,
        ) ?? normalizePositiveNumber((rule.config as ProductDiscountRuleConfig | null)?.buy);
      if (!percent) return null;
      return Math.max(0, roundPrice(basePrice * (1 - Math.min(percent, 100) / 100)));
    }
    case "fixed": {
      const amount =
        normalizePositiveNumber(
          rule.config?.discountAmount ?? rule.config?.discount_amount,
        ) ?? normalizePositiveNumber((rule.config as ProductDiscountRuleConfig | null)?.get);
      if (!amount) return null;
      return Math.max(0, roundPrice(basePrice - amount));
    }
    case "bulk": {
      if (getRuleMinQty(rule) > 1) return null;
      const percent = normalizePositiveNumber(
        rule.config?.discountPercent ?? rule.config?.discount_percent,
      );
      if (percent) {
        return Math.max(0, roundPrice(basePrice * (1 - Math.min(percent, 100) / 100)));
      }

      const amount = normalizePositiveNumber(
        rule.config?.discountAmount ?? rule.config?.discount_amount,
      );
      if (amount) {
        return Math.max(0, roundPrice(basePrice - amount));
      }

      return null;
    }
    case "buy_x_get_y":
    default:
      return null;
  }
}

export function resolveVariantDisplayPricing(
  variant: VariantDisplayPricingInput,
  rules: ProductDiscountRule[] = [],
): VariantDisplayPricing {
  const basePrice = Math.max(0, roundPrice(Number(variant.price) || 0));
  const explicitOriginalPrice = normalizePositiveNumber(variant.originalPrice);

  if (explicitOriginalPrice && explicitOriginalPrice > basePrice) {
    return {
      price: basePrice,
      originalPrice: roundPrice(explicitOriginalPrice),
      hasDiscount: true,
      discountPercent: Math.round((1 - basePrice / explicitOriginalPrice) * 100),
    };
  }

  const activeRules = rules
    .filter((rule) => isRuleActive(rule))
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));

  let bestDiscountedPrice = basePrice;

  for (const rule of activeRules) {
    const candidatePrice = calculateRuleDiscountedPrice(basePrice, rule);
    if (candidatePrice === null) {
      continue;
    }

    if (candidatePrice < bestDiscountedPrice) {
      bestDiscountedPrice = candidatePrice;
    }
  }

  if (bestDiscountedPrice < basePrice) {
    return {
      price: bestDiscountedPrice,
      originalPrice: basePrice,
      hasDiscount: true,
      discountPercent: Math.round((1 - bestDiscountedPrice / basePrice) * 100),
    };
  }

  return {
    price: basePrice,
    originalPrice: undefined,
    hasDiscount: false,
    discountPercent: 0,
  };
}
