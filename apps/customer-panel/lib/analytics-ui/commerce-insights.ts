export type FunnelDrop = Readonly<{
  from: string;
  to: string;
  lost: number;
  rate: number;
}>;

export const FUNNEL_STEPS = [
  ["product_view", "Ürün görüntüleme"],
  ["add_to_cart", "Sepete ekleme"],
  ["view_cart", "Sepeti görme"],
  ["begin_checkout", "Ödemeye geçiş"],
  ["payment_method_selected", "Ödeme yöntemi"],
  ["purchase", "Satın alma"],
] as const;

export function largestFunnelDrop(
  events: Readonly<Record<string, number>>,
): FunnelDrop | null {
  let largest: FunnelDrop | null = null;
  for (let index = 1; index < FUNNEL_STEPS.length; index += 1) {
    const [previousKey, previousLabel] = FUNNEL_STEPS[index - 1];
    const [currentKey, currentLabel] = FUNNEL_STEPS[index];
    const previous = events[previousKey];
    const current = events[currentKey];
    if (
      !Number.isSafeInteger(previous) ||
      !Number.isSafeInteger(current) ||
      previous <= 0 ||
      current < 0 ||
      current > previous
    ) continue;
    const lost = previous - current;
    if (!lost) continue;
    const rate = lost / previous;
    if (!largest || lost > largest.lost) {
      largest = { from: previousLabel, to: currentLabel, lost, rate };
    }
  }
  return largest;
}

export function salesPointsForCurrency(
  series: readonly Readonly<{ startsAt: string; currency: string; grossRevenueMinor: number; paidOrders?: number }>[],
  currency: string,
): readonly Readonly<{ startsAt: string; value: number; paidOrders?: number }>[] {
  return series
    .filter((point) => point.currency === currency)
    .map((point) => ({
      startsAt: point.startsAt,
      value: point.grossRevenueMinor,
      ...(point.paidOrders === undefined ? {} : { paidOrders: point.paidOrders }),
    }))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function dailySalesPointsForCurrency(
  series: readonly Readonly<{ startsAt: string; currency: string; grossRevenueMinor: number; paidOrders: number }>[],
  currency: string,
  range: Readonly<{ start: string; end: string; timezone: string }>,
): readonly Readonly<{ day: string; value: number; paidOrders: number }>[] {
  const start = Date.parse(range.start);
  const end = Date.parse(range.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: range.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayOf = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const first = Date.parse(`${dayOf(start)}T00:00:00.000Z`);
  const last = Date.parse(`${dayOf(end - 1)}T00:00:00.000Z`);
  const values = new Map<string, { value: number; paidOrders: number }>();
  for (const point of series) {
    if (point.currency !== currency) continue;
    const instant = Date.parse(point.startsAt);
    if (!Number.isFinite(instant) || instant < start || instant >= end) continue;
    const day = dayOf(instant);
    const previous = values.get(day) ?? { value: 0, paidOrders: 0 };
    values.set(day, { value: previous.value + point.grossRevenueMinor, paidOrders: previous.paidOrders + point.paidOrders });
  }
  const days = Math.min(401, Math.floor((last - first) / 86_400_000) + 1);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(first + index * 86_400_000).toISOString().slice(0, 10);
    return { day, ...(values.get(day) ?? { value: 0, paidOrders: 0 }) };
  });
}
