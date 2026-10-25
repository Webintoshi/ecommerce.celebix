const FORMATTER_CACHE_LIMIT = 32;
const moneyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
let percentFormatter: Intl.NumberFormat | undefined;

function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const formatter = create();
  if (cache.size >= FORMATTER_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, formatter);
  return formatter;
}

export function analyticsMoney(valueMinor: number, currency: string): string {
  return cached(moneyFormatters, currency, () => new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  })).format(valueMinor / 100);
}

export function analyticsPercent(value: number | null): string {
  if (value === null) return "—";
  percentFormatter ??= new Intl.NumberFormat("tr-TR", {
    style: "percent",
    maximumFractionDigits: 1,
  });
  return percentFormatter.format(value);
}

export function analyticsDateTime(value: string, timezone: string): string {
  return cached(dateFormatters, `timestamp:${timezone}`, () => new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  })).format(new Date(value));
}

export function analyticsDayLabel(value: string, timezone: string): string {
  const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const selectedTimezone = calendarDay ? "UTC" : timezone;
  return cached(dateFormatters, `day:${selectedTimezone}`, () => new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: selectedTimezone,
  })).format(new Date(calendarDay ? `${value}T00:00:00.000Z` : value));
}
