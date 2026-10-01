import type { PromotionDraft } from "@/lib/promotion-ui/model";
import styles from "./promotion-illustration.module.css";

const KINDS = new Set([
  "first_paid_order_percentage", "basket_threshold_fixed_amount", "free_shipping",
  "buy_x_get_y", "quantity_tiers", "category_percentage", "bundle_price", "gift",
  "abandoned_cart", "vip", "influencer_code", "custom",
]);

const BENEFIT_ART: Readonly<Record<string, string>> = {
  percentage: "influencer_code", fixed_amount: "basket_threshold_fixed_amount",
  free_shipping: "free_shipping", buy_x_get_y: "buy_x_get_y",
  quantity_tiers: "quantity_tiers", bundle_price: "bundle_price", gift: "gift",
};

export function promotionIllustrationKind(draft: Pick<PromotionDraft, "templateId" | "benefit">): string {
  return draft.templateId === "custom" ? BENEFIT_ART[draft.benefit.kind] ?? "custom" : draft.templateId;
}

export function PromotionIllustration({ kind, className, eager = false }: Readonly<{
  kind: string; className?: string; eager?: boolean;
}>) {
  const asset = KINDS.has(kind) ? kind : "custom";
  return <img
    className={`${styles.art}${className ? ` ${className}` : ""}`}
    src={`/images/promotions/v2/${asset}.webp`}
    width={240} height={240} alt="" aria-hidden="true"
    loading={eager ? "eager" : "lazy"} decoding="async"
  />;
}
