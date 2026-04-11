import {
  createDefaultShippingZones,
  getShippingRatePrice,
  getShippingRatesForCountry as getSharedShippingRatesForCountry,
  getShippingRatesForLocation,
  normalizeShippingZones,
  type ShippingLocation,
  type ShippingRate,
  type ShippingZone,
} from "@celebix/platform-config/src/shipping";

export type { ShippingRate, ShippingZone } from "@celebix/platform-config/src/shipping";
const DEFAULT_SHIPPING_COUNTRY = "Türkiye";

export function getShippingZones(value?: unknown): ShippingZone[] {
  return value == null ? createDefaultShippingZones() : normalizeShippingZones(value);
}

export function getShippingRatesForLocationFromZones(
  zones: ShippingZone[],
  location: ShippingLocation,
): ShippingRate[] {
  return getShippingRatesForLocation(zones, location);
}

export function getShippingRatesForCountry(
  country = "Türkiye",
  zones: ShippingZone[] = createDefaultShippingZones(),
): ShippingRate[] {
  return getSharedShippingRatesForCountry(zones, country);
}

export async function fetchShippingZonesFromSettings(): Promise<ShippingZone[]> {
  const response = await fetch("/api/settings?type=shipping", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Kargo bölgeleri yüklenemedi.");
  }

  return normalizeShippingZones(payload.shippingOptions);
}

export async function fetchShippingRatesForLocation(location: ShippingLocation): Promise<ShippingRate[]> {
  const zones = await fetchShippingZonesFromSettings();
  return getShippingRatesForLocation(zones, location);
}

export function getResolvedShippingPrice(rate: ShippingRate, subtotal = 0): number {
  return getShippingRatePrice(rate, subtotal);
}

export interface CartShippingSummary {
  threshold: number | null;
  shippingCost: number;
  remaining: number;
  progress: number;
  qualifiesForFreeShipping: boolean;
}

export function getCartShippingSummary(
  zones: ShippingZone[] = createDefaultShippingZones(),
  subtotal = 0,
  country = DEFAULT_SHIPPING_COUNTRY,
): CartShippingSummary {
  const rates = getSharedShippingRatesForCountry(zones, country).filter((rate) => rate.enabled !== false);
  const thresholds = rates
    .map((rate) => (
      typeof rate.minOrder === "number" && Number.isFinite(rate.minOrder) && rate.minOrder > 0
        ? rate.minOrder
        : null
    ))
    .filter((value): value is number => value != null);

  const threshold = thresholds.length > 0 ? Math.min(...thresholds) : null;
  const qualifiesForFreeShipping = threshold != null ? subtotal >= threshold : false;
  const candidateShippingCosts = rates
    .filter((rate) => {
      if (typeof rate.minOrder === "number" && rate.minOrder > 0 && subtotal < rate.minOrder && rate.price === 0) {
        return false;
      }

      return true;
    })
    .map((rate) => getShippingRatePrice(rate, subtotal))
    .filter((price) => Number.isFinite(price) && price > 0);

  const shippingCost = qualifiesForFreeShipping
    ? 0
    : (candidateShippingCosts.length > 0 ? Math.min(...candidateShippingCosts) : 0);
  const remaining = threshold != null ? Math.max(threshold - subtotal, 0) : 0;
  const progress = threshold != null && threshold > 0
    ? Math.min((subtotal / threshold) * 100, 100)
    : (qualifiesForFreeShipping ? 100 : 0);

  return {
    threshold,
    shippingCost,
    remaining,
    progress,
    qualifiesForFreeShipping,
  };
}
