import { parseMerchantAdminConfig, type MerchantAdminJson, type MerchantAdminRecord } from "@celebix/saas-contracts";
import { parseTurkishMoneyToCents } from "../catalog-onboarding-ui/forms.ts";

export type CheckoutDeliverySettings = Readonly<{ shippingPriceCents: number; estimatedDays?: number }>;
const ALLOWED_KEYS = new Set(["shippingPriceCents", "estimatedDays", "regions", "freeShippingThresholdCents"]);
function invalid(): never { throw new Error("checkout_delivery_config_invalid"); }

export function readCheckoutDeliverySettings(config: unknown): CheckoutDeliverySettings | null {
  const value = parseMerchantAdminConfig(config);
  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) invalid();
  if (Object.hasOwn(value, "estimatedDays") && (!Number.isSafeInteger(value.estimatedDays) || (value.estimatedDays as number) < 1 || (value.estimatedDays as number) > 365)) invalid();
  if (!Object.hasOwn(value, "shippingPriceCents")) return null;
  const fee = value.shippingPriceCents;
  if (!Number.isSafeInteger(fee) || (fee as number) < 0 || (fee as number) > 100000000) invalid();
  return Object.freeze({ shippingPriceCents: fee as number, ...(Object.hasOwn(value, "estimatedDays") ? { estimatedDays: value.estimatedDays as number } : {}) });
}

export function parseCheckoutDeliveryForm(input: Readonly<{ price: string; days: string }>): CheckoutDeliverySettings | null {
  const fee = parseTurkishMoneyToCents(input.price);
  if (fee === null || fee > 100000000 || (input.days !== "" && !/^[1-9]\d{0,2}$/.test(input.days))) return null;
  const days = input.days === "" ? undefined : Number(input.days);
  if (days !== undefined && days > 365) return null;
  return Object.freeze({ shippingPriceCents: fee, ...(days === undefined ? {} : { estimatedDays: days }) });
}

export function buildCheckoutDeliveryConfig(existing: Readonly<Record<string, MerchantAdminJson>>, settings: CheckoutDeliverySettings): Readonly<Record<string, MerchantAdminJson>> {
  if (Object.keys(settings).some((key) => !["shippingPriceCents", "estimatedDays"].includes(key))) invalid();
  const selected = readCheckoutDeliverySettings(settings);
  if (selected === null) invalid();
  const previous = parseMerchantAdminConfig(existing);
  if (Object.keys(previous).some((key) => !ALLOWED_KEYS.has(key))) invalid();
  const { estimatedDays: _days, shippingPriceCents: _fee, ...preserved } = previous;
  return Object.freeze({ ...preserved, ...selected });
}

export function selectCheckoutDeliveryRecord(records: readonly MerchantAdminRecord[]): MerchantAdminRecord | null {
  return records.filter((record) => record.kind === "shipping_setting" && record.status !== "archived")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0] ?? null;
}
