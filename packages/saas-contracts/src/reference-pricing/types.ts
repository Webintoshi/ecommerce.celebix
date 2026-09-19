export type ReferenceKind = "usd" | "eur" | "gold_gram";
export type PricingMethod = "fixed_try" | ReferenceKind;
export type PurityMode = "direct" | "ratio";
export type LaborMode = "none" | "per_item_try" | "per_gram_try";

export type ReferenceDefinition = Readonly<{
  id: string;
  kind: ReferenceKind;
  label: string;
  rateTry: string;
  referencePurity?: string;
}>;

export type ReferenceIdentity = Readonly<{
  id: string;
  kind: ReferenceKind;
  label: string;
  referencePurity?: string;
  createdAt: string;
}>;

export type FixedTryPricingPolicy = Readonly<{
  method: "fixed_try";
  fixedPriceCents: number;
}>;

export type FxPricingPolicy = Readonly<{
  method: "usd" | "eur";
  referenceId: string;
  sourceAmount: string;
  upliftPercent?: string;
  laborMode?: "none" | "per_item_try";
  laborAmount?: string;
}>;

export type GoldPricingPolicy = Readonly<{
  method: "gold_gram";
  referenceId: string;
  metalGrams: string;
  purityMode: PurityMode;
  productPurity?: string;
  laborMode: LaborMode;
  laborAmount?: string;
  upliftPercent: string;
  allowFullDiscount: boolean;
}>;

export type VariantPricingPolicy =
  | FixedTryPricingPolicy
  | FxPricingPolicy
  | GoldPricingPolicy;
