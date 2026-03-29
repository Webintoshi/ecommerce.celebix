// =====================================================
// PRICE CALCULATOR
// Calculates final price based on selections
// =====================================================

import {
  CustomizationStep,
  PriceBreakdown,
  PriceAdjustment,
  CustomizationOption,
} from "@/types/product-customization";

/**
 * Calculate price for a single option
 */
function calculateOptionPrice(
  basePrice: number,
  option: CustomizationOption
): number {
  const { price_adjustment, price_adjustment_type } = option;

  switch (price_adjustment_type) {
    case "fixed":
      return price_adjustment;

    case "percentage":
      return (basePrice * price_adjustment) / 100;

    case "multiplier":
      return basePrice * (price_adjustment - 1);

    default:
      return price_adjustment;
  }
}

/**
 * Calculate price adjustment for a step based on its value
 */
function calculateStepPriceAdjustment(
  step: CustomizationStep,
  value: unknown,
  basePrice: number
): { adjustment: number; details: PriceAdjustment | null } {
  // Handle option-based steps
  if (
    step.type === "select" ||
    step.type === "radio_group" ||
    step.type === "image_select" ||
    step.type === "multi_select"
  ) {
    if (!step.options || !value) {
      return { adjustment: 0, details: null };
    }

    const selectedValues = Array.isArray(value) ? value : [String(value)];
    let totalAdjustment = 0;

    for (const selectedValue of selectedValues) {
      const option = step.options.find((o) => o.value === selectedValue);
      if (option) {
        totalAdjustment += calculateOptionPrice(basePrice, option);
      }
    }

    if (totalAdjustment === 0) {
      return { adjustment: 0, details: null };
    }

    const selectedOption = step.options.find((o) => o.value === selectedValues[0]);

    return {
      adjustment: totalAdjustment,
      details: {
        step_key: step.key,
        step_label: step.label,
        option_value: selectedOption?.value,
        option_label: selectedOption?.label,
        adjustment_type: selectedOption?.price_adjustment_type || "fixed",
        adjustment_amount: totalAdjustment,
      },
    };
  }

  // Handle text/textarea with price per character
  if (
    (step.type === "text" || step.type === "textarea") &&
    step.price_config?.price_per_character &&
    typeof value === "string"
  ) {
    const charCount = value.length;
    const adjustment = charCount * step.price_config.price_per_character;

    return {
      adjustment,
      details: {
        step_key: step.key,
        step_label: step.label,
        adjustment_type: "per_character",
        character_count: charCount,
        adjustment_amount: adjustment,
      },
    };
  }

  // Handle base price adjustment from step
  if (step.price_config?.base_price_adjustment) {
    return {
      adjustment: step.price_config.base_price_adjustment,
      details: {
        step_key: step.key,
        step_label: step.label,
        adjustment_type: "base",
        adjustment_amount: step.price_config.base_price_adjustment,
      },
    };
  }

  return { adjustment: 0, details: null };
}

/**
 * Calculate total price breakdown
 */
export function calculatePrice(
  basePrice: number,
  steps: CustomizationStep[],
  values: Record<string, unknown>
): PriceBreakdown {
  const adjustments: PriceAdjustment[] = [];
  let totalAdjustment = 0;

  for (const step of steps) {
    const value = values[step.key];
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const { adjustment, details } = calculateStepPriceAdjustment(
      step,
      value,
      basePrice + totalAdjustment
    );

    if (adjustment !== 0 && details) {
      adjustments.push(details);
      totalAdjustment += adjustment;
    }
  }

  return {
    base_price: basePrice,
    adjustments,
    total_adjustment: totalAdjustment,
    final_price: basePrice + totalAdjustment,
  };
}

/**
 * Format price for display
 */
export function formatPrice(price: number, currency: string = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * Get minimum possible price (with all minimum adjustments)
 */
export function getMinPrice(
  basePrice: number,
  steps: CustomizationStep[]
): number {
  let minPrice = basePrice;

  for (const step of steps) {
    if (step.price_config?.base_price_adjustment) {
      minPrice += step.price_config.base_price_adjustment;
    }

    if (step.options) {
      const minOption = step.options.reduce((min, opt) =>
        opt.price_adjustment < min.price_adjustment ? opt : min
      );
      minPrice += calculateOptionPrice(basePrice, minOption);
    }
  }

  return minPrice;
}

/**
 * Get maximum possible price (with all maximum adjustments)
 */
export function getMaxPrice(
  basePrice: number,
  steps: CustomizationStep[]
): number {
  let maxPrice = basePrice;

  for (const step of steps) {
    if (step.price_config?.base_price_adjustment) {
      maxPrice += step.price_config.base_price_adjustment;
    }

    if (step.options) {
      const maxOption = step.options.reduce((max, opt) =>
        opt.price_adjustment > max.price_adjustment ? opt : max
      );
      maxPrice += calculateOptionPrice(basePrice, maxOption);
    }

    // For text/textarea, assume max length if price per character
    if (
      (step.type === "text" || step.type === "textarea") &&
      step.price_config?.price_per_character &&
      step.validation_rules?.max_length
    ) {
      maxPrice +=
        step.validation_rules.max_length * step.price_config.price_per_character;
    }
  }

  return maxPrice;
}
