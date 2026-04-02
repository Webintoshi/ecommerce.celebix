import {
  createDefaultShippingZones,
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
