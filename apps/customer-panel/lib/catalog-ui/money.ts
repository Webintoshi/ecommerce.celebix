const TURKISH_MONEY = /^(?:0|[1-9]\d*)(?:,(\d{1,2}))?$/;

export function parseTurkishMoneyToCents(value: string): number {
  const match = TURKISH_MONEY.exec(value);
  if (match === null) throw new TypeError("catalog_money_invalid");
  const fraction = (match[1] ?? "").padEnd(2, "0");
  const whole = value.split(",", 1)[0];
  const cents = Number(whole) * 100 + Number(fraction || "0");
  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError("catalog_money_invalid");
  return cents;
}

export function formatTurkishMoney(cents: number, currency?: string): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError("catalog_money_invalid");
  return new Intl.NumberFormat("tr-TR", {
    style: currency === undefined ? "decimal" : "currency",
    ...(currency === undefined ? {} : { currency }),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatTurkishMoneyInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError("catalog_money_invalid");
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
