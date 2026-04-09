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
