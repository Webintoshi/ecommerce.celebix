import { formatTurkishMoneyInput, parseTurkishMoneyToCents } from "../catalog-ui/money.ts";

export function parseInventoryMoneyToCents(value: string): number {
  if (!/^(?:0|[1-9]\d*)(?:[,.]\d{1,2})?$/.test(value)) throw new TypeError("inventory_money_invalid");
  try {
    const cents = parseTurkishMoneyToCents(value.replace(".", ","));
    if (cents > 8_000_000_000) throw new TypeError();
    return cents;
  } catch {
    throw new TypeError("inventory_money_invalid");
  }
}

export const formatInventoryMoneyInput = formatTurkishMoneyInput;
