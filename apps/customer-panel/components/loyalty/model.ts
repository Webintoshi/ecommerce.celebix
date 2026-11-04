import { parseLoyaltyConfig, type LoyaltyConfig, type LoyaltyProgram, type LoyaltyTemplate } from "@celebix/saas-contracts";
import { zonedCivilDayStartToIso } from "../../lib/promotion-ui/model.ts";
import { parseMinorUnits } from "../../lib/in-store-sales-ui/model.ts";

export const LOYALTY_TEMPLATES = [
  { id: "product_gift", title: "Ürün biriktir, hediye kazan", help: "Belirlediğiniz ürünlerden 5 adet alana bir hediye ürün.", art: "buy_x_get_y" },
  { id: "purchase_gift", title: "Alışverişlerini tamamla, hediye kazan", help: "3 ayrı alışverişi tamamlayan müşteriye seçtiğiniz ürün.", art: "gift" },
  { id: "spend_discount", title: "Harcama hedefine ulaş, indirim kazan", help: "2.000 TL alışverişe, sonraki alışverişte 150 TL indirim.", art: "basket_threshold_fixed_amount" },
  { id: "purchase_shipping", title: "Hedefini tamamla, kargo bizden", help: "3 ayrı alışverişten sonra bir ücretsiz kargo hakkı.", art: "free_shipping" },
] as const;

export type LoyaltyDraft = Readonly<{
  name: string; template: LoyaltyTemplate; target: string; eligibleProductIds: readonly string[];
  variantId: string; quantity: string; amount: string; shippingMethodIds: readonly string[];
  minimumBasket: string; rewardMinimumBasket: string; channels: LoyaltyConfig["channels"];
  startsOn: string; endsOn: string; repeat: boolean; maxOncePerDay: boolean;
  allowMultiplePrograms: boolean; allowCombination: boolean; progressExpiryDays: string; rewardExpiryDays: string; enabled: boolean;
}>;

export function createLoyaltyDraft(template: LoyaltyTemplate): LoyaltyDraft {
  return { name: "", template, target: template === "product_gift" ? "5" : template === "spend_discount" ? "2000" : "3", eligibleProductIds: [], variantId: "", quantity: "1", amount: "150", shippingMethodIds: [], minimumBasket: "0", rewardMinimumBasket: "0", channels: ["storefront", "in_store", "manual"], startsOn: "", endsOn: "", repeat: true, maxOncePerDay: false, allowMultiplePrograms: false, allowCombination: false, progressExpiryDays: "", rewardExpiryDays: "", enabled: true };
}

function civilDate(iso: string | null, timezone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function draftForProgram(program: LoyaltyProgram): LoyaltyDraft {
  const c = program.config;
  return { ...createLoyaltyDraft(c.template), name: program.name, target: String(c.template === "spend_discount" ? c.target / 100 : c.target), eligibleProductIds: c.eligibleProductIds, variantId: c.reward.kind === "gift" ? c.reward.variantId : "", quantity: c.reward.kind === "gift" ? String(c.reward.quantity) : "1", amount: c.reward.kind === "discount" ? String(c.reward.amountMinor / 100) : "150", shippingMethodIds: c.reward.kind === "shipping" ? c.reward.shippingMethodIds : [], minimumBasket: String(c.minimumBasketMinor / 100), rewardMinimumBasket: String(c.rewardMinimumBasketMinor / 100), channels: c.channels, startsOn: civilDate(c.startsAt, c.timezone), endsOn: c.endsAt ? civilDate(new Date(new Date(c.endsAt).getTime() - 1).toISOString(), c.timezone) : "", repeat: c.repeat, maxOncePerDay: c.maxOncePerDay, allowMultiplePrograms: c.allowMultiplePrograms, allowCombination: c.allowCombination, progressExpiryDays: c.progressExpiryDays === null ? "" : String(c.progressExpiryDays), rewardExpiryDays: c.rewardExpiryDays === null ? "" : String(c.rewardExpiryDays), enabled: program.status !== "paused" };
}

function whole(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error("Adet ve gün alanlarına tam sayı girin.");
  return Number(value);
}
function money(value: string): number {
  const amount = parseMinorUnits(value);
  if (amount === null) throw new Error("Tutarları en fazla iki ondalık basamakla girin.");
  return amount;
}
export function loyaltyConfigFor(draft: LoyaltyDraft, timezone: string): LoyaltyConfig {
  if (draft.startsOn && draft.endsOn && draft.startsOn > draft.endsOn) throw new Error("Bitiş tarihi başlangıçtan önce olamaz.");
  const end = draft.endsOn ? new Date(`${draft.endsOn}T00:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() + 1);
  const reward = draft.template === "spend_discount" ? { kind: "discount" as const, amountMinor: money(draft.amount) } : draft.template === "purchase_shipping" ? { kind: "shipping" as const, shippingMethodIds: draft.shippingMethodIds } : { kind: "gift" as const, variantId: draft.variantId, quantity: whole(draft.quantity) };
  if (reward.kind === "gift" && !reward.variantId) throw new Error("Hediye ürünün varyantını seçin.");
  if (draft.template === "product_gift" && !draft.eligibleProductIds.length) throw new Error("Biriktirilecek ürünleri seçin.");
  try {
    return parseLoyaltyConfig({ schemaVersion: 1, template: draft.template, target: draft.template === "spend_discount" ? money(draft.target) : whole(draft.target), eligibleProductIds: draft.eligibleProductIds, reward, minimumBasketMinor: money(draft.minimumBasket), rewardMinimumBasketMinor: money(draft.rewardMinimumBasket), channels: draft.channels, startsAt: draft.startsOn ? zonedCivilDayStartToIso(draft.startsOn, timezone) : null, endsAt: end ? zonedCivilDayStartToIso(end.toISOString().slice(0, 10), timezone) : null, timezone, repeat: draft.repeat, maxOncePerDay: draft.maxOncePerDay, allowMultiplePrograms: draft.allowMultiplePrograms, allowCombination: draft.allowCombination, progressExpiryDays: draft.progressExpiryDays ? whole(draft.progressExpiryDays) : null, rewardExpiryDays: draft.rewardExpiryDays ? whole(draft.rewardExpiryDays) : null });
  } catch { throw new Error("Hedef, ödül, satış kanalı ve süre alanlarını kontrol edin."); }
}

export const formatLoyaltyMoney = (minor: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(minor / 100);
export function loyaltyReturnPolicy(config: Pick<LoyaltyConfig, "template" | "eligibleProductIds">): string {
  return config.template === "spend_discount" && config.eligibleProductIds.length === 0
    ? "İadeler ürün alışveriş tutarından düşülür."
    : "İade yapılan alışveriş hedefe sayılmaz. Yetkili kişi ilerlemeyi düzeltebilir.";
}
export function loyaltySummary(config: LoyaltyConfig): string {
  const target = config.template === "spend_discount" ? `${formatLoyaltyMoney(config.target)} ürün alışverişi` : `${config.target} ${config.template === "product_gift" ? "ürün" : "ayrı alışveriş"}`;
  const reward = config.reward.kind === "gift" ? `${config.reward.quantity} hediye ürün` : config.reward.kind === "discount" ? `${formatLoyaltyMoney(config.reward.amountMinor)} indirim` : "ücretsiz kargo";
  return `${target} → ${reward}`;
}
