export interface ShippingRate {
  id: string;
  name: string;
  price: number;
  condition?: string;
  estimatedDays?: string;
  minOrder?: number;
  enabled?: boolean;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  rates: ShippingRate[];
}

export interface ShippingLocation {
  country?: string;
  city?: string;
}

const DEFAULT_COUNTRY = "Türkiye";

const DEFAULT_ZONES: ShippingZone[] = [
  {
    id: "zone-tr",
    name: "Türkiye",
    countries: [DEFAULT_COUNTRY],
    rates: [
      {
        id: "rate-standard",
        name: "Standart Kargo",
        price: 49.9,
        estimatedDays: "1-3 iş günü",
        enabled: true,
      },
      {
        id: "rate-free",
        name: "Ücretsiz Kargo",
        price: 0,
        minOrder: 500,
        estimatedDays: "1-3 iş günü",
        condition: "500 TL üzeri siparişlerde ücretsiz",
        enabled: true,
      },
    ],
  },
];

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeRate(value: unknown, index: number): ShippingRate {
  const record = asRecord(value);

  if (!record) {
    return {
      id: `rate-${index + 1}`,
      name: `Kargo ${index + 1}`,
      price: 0,
      enabled: true,
    };
  }

  const id = typeof record.id === "string" && record.id.trim().length > 0
    ? record.id
    : `rate-${index + 1}`;

  const name = typeof record.name === "string" && record.name.trim().length > 0
    ? record.name.trim()
    : `Kargo ${index + 1}`;

  const price = typeof record.price === "number"
    ? record.price
    : Number(record.price ?? 0);

  const condition = typeof record.condition === "string" && record.condition.trim().length > 0
    ? record.condition.trim()
    : undefined;

  const estimatedDays = typeof record.estimatedDays === "string" && record.estimatedDays.trim().length > 0
    ? record.estimatedDays.trim()
    : undefined;

  const minOrder = typeof record.minOrder === "number"
    ? record.minOrder
    : record.minOrder != null && record.minOrder !== ""
      ? Number(record.minOrder)
      : undefined;

  const enabled = typeof record.enabled === "boolean" ? record.enabled : true;

  return {
    id,
    name,
    price: Number.isFinite(price) ? price : 0,
    condition,
    estimatedDays,
    minOrder: minOrder != null && Number.isFinite(minOrder) ? minOrder : undefined,
    enabled,
  };
}

function normalizeLegacyRate(value: unknown, index: number): ShippingRate {
  const record = asRecord(value);

  if (!record) {
    return normalizeRate(value, index);
  }

  return normalizeRate(
    {
      ...record,
      condition: typeof record.condition === "string" && record.condition.trim().length > 0
        ? record.condition
        : typeof record.estimatedDays === "string"
          ? record.estimatedDays
          : undefined,
    },
    index,
  );
}

export function createDefaultShippingZones(): ShippingZone[] {
  return DEFAULT_ZONES.map((zone) => ({
    ...zone,
    countries: [...zone.countries],
    rates: zone.rates.map((rate) => ({ ...rate })),
  }));
}

export function normalizeShippingZones(value: unknown): ShippingZone[] {
  const rootRecord = asRecord(value);
  const candidate = Array.isArray(value)
    ? value
    : Array.isArray(rootRecord?.options)
      ? rootRecord?.options
      : Array.isArray(rootRecord?.zones)
        ? rootRecord?.zones
        : [];

  if (candidate.length === 0) {
    return createDefaultShippingZones();
  }

  const isLegacyFlatRateList = candidate.every((entry) => {
    const record = asRecord(entry);
    return Boolean(record) && !Array.isArray(record?.rates);
  });

  if (isLegacyFlatRateList) {
    return [
      {
        id: "zone-default",
        name: DEFAULT_COUNTRY,
        countries: [DEFAULT_COUNTRY],
        rates: candidate.map((rate, index) => normalizeLegacyRate(rate, index)),
      },
    ];
  }

  const zones = candidate
    .map((entry, index) => {
      const record = asRecord(entry);

      if (!record) {
        return null;
      }

      const ratesCandidate = Array.isArray(record.rates) ? record.rates : [];
      const countries = normalizeStringArray(record.countries);

      return {
        id: typeof record.id === "string" && record.id.trim().length > 0
          ? record.id
          : `zone-${index + 1}`,
        name: typeof record.name === "string" && record.name.trim().length > 0
          ? record.name.trim()
          : `Teslimat Bölgesi ${index + 1}`,
        countries: countries.length > 0 ? countries : [DEFAULT_COUNTRY],
        rates: ratesCandidate.map((rate, rateIndex) => normalizeRate(rate, rateIndex)),
      } satisfies ShippingZone;
    })
    .filter((zone): zone is ShippingZone => Boolean(zone));

  return zones.length > 0 ? zones : createDefaultShippingZones();
}

export function getShippingRatePrice(rate: ShippingRate, subtotal = 0): number {
  if (typeof rate.minOrder === "number" && subtotal >= rate.minOrder) {
    return 0;
  }

  return Number.isFinite(rate.price) ? rate.price : 0;
}

export function getShippingRatesForLocation(
  zones: ShippingZone[],
  location: ShippingLocation,
): ShippingRate[] {
  const normalizedCity = location.city ? normalizeToken(location.city) : "";
  const normalizedCountry = location.country ? normalizeToken(location.country) : normalizeToken(DEFAULT_COUNTRY);

  const exactZone =
    zones.find((zone) => zone.countries.some((value) => normalizeToken(value) === normalizedCity)) ??
    zones.find((zone) => zone.countries.some((value) => normalizeToken(value) === normalizedCountry)) ??
    zones[0];

  return (exactZone?.rates ?? []).filter((rate) => rate.enabled !== false);
}

export function getShippingRatesForCountry(zones: ShippingZone[], country = DEFAULT_COUNTRY): ShippingRate[] {
  return getShippingRatesForLocation(zones, { country });
}
