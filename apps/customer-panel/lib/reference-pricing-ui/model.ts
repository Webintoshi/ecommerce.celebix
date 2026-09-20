import { parseVariantPricingPolicy, type ReferenceIdentity, type VariantPricingPolicy } from "@celebix/saas-contracts";
import type { ReferenceImpactPreview, ReferenceSetValue, VariantPolicyPreview } from "@celebix/saas-data";

import { parseTurkishPricingDecimal } from "./decimal.ts";

export type ReferenceRateDraft = Readonly<{ referenceId: string; rateText: string; active: boolean }>;

export type VariantPolicyDraft = Readonly<
  | { method: "fixed_try"; fixedPriceCents: number }
  | {
    method: "usd" | "eur";
    referenceId: string;
    sourceText: string;
    upliftText?: string;
    laborMode?: "none" | "per_item_try";
    laborText?: string;
  }
  | {
    method: "gold_gram";
    referenceId: string;
    gramsText: string;
    purityMode: "direct" | "ratio";
    productPurityText?: string;
    laborMode: "none" | "per_item_try" | "per_gram_try";
    laborText?: string;
    upliftText: string;
    allowFullDiscount: boolean;
  }
>;

function invalid(): never { throw new TypeError("reference_pricing_draft_invalid"); }

function decimalText(text: string, scale: 6 | 8, positive = false): string {
  const value = parseTurkishPricingDecimal(text, scale);
  if (value === null || (positive && /^0(?:\.0+)?$/.test(value))) invalid();
  return value;
}

export function buildReferenceSetValues(definitions: readonly ReferenceIdentity[], drafts: readonly ReferenceRateDraft[]): readonly ReferenceSetValue[] {
  if (!Array.isArray(definitions) || definitions.length < 1 || definitions.length > 100
    || !Array.isArray(drafts) || drafts.length !== definitions.length) invalid();
  const byId = new Map<string, ReferenceRateDraft>();
  for (const draft of drafts) {
    if (!draft || typeof draft.referenceId !== "string" || typeof draft.rateText !== "string" || typeof draft.active !== "boolean"
      || byId.has(draft.referenceId)) invalid();
    byId.set(draft.referenceId, draft);
  }
  const values = definitions.map((definition) => {
    const draft = byId.get(definition.id);
    if (!draft) invalid();
    const rateTry = draft.rateText === "" ? null : decimalText(draft.rateText, 8, true);
    if (draft.active && rateTry === null) invalid();
    return Object.freeze({ referenceId: definition.id, rateTry, active: draft.active });
  });
  return Object.freeze(values);
}

export function canActivateReferenceSet(input: Readonly<{
  savedSetId: string | null;
  preview: ReferenceImpactPreview | null;
  dirty: boolean;
}>): boolean {
  const preview = input.preview;
  return Boolean(input.savedSetId && preview && !input.dirty && preview.setId === input.savedSetId
    && /^[a-f0-9]{64}$/.test(preview.scopeDigest));
}

export function buildVariantPricingPolicy(draft: VariantPolicyDraft): VariantPricingPolicy {
  try {
    if (draft.method === "fixed_try") return parseVariantPricingPolicy({ method: "fixed_try", fixedPriceCents: draft.fixedPriceCents });
    if (draft.method === "usd" || draft.method === "eur") {
      const result = {
        method: draft.method,
        referenceId: draft.referenceId,
        sourceAmount: decimalText(draft.sourceText, 8, true),
        ...(draft.upliftText === undefined || draft.upliftText === "" ? {} : { upliftPercent: decimalText(draft.upliftText, 8) }),
        ...(draft.laborMode === undefined ? {} : { laborMode: draft.laborMode }),
        ...(draft.laborMode === "per_item_try" ? { laborAmount: decimalText(draft.laborText ?? "", 8) } : {}),
      };
      return parseVariantPricingPolicy(result);
    }
    if (draft.method === "gold_gram") {
      const result = {
        method: "gold_gram",
        referenceId: draft.referenceId,
        metalGrams: decimalText(draft.gramsText, 6, true),
        purityMode: draft.purityMode,
        ...(draft.purityMode === "ratio" ? { productPurity: decimalText(draft.productPurityText ?? "", 8, true) } : {}),
        laborMode: draft.laborMode,
        ...(draft.laborMode === "none" ? {} : { laborAmount: decimalText(draft.laborText ?? "", 8) }),
        upliftPercent: decimalText(draft.upliftText, 8),
        allowFullDiscount: draft.allowFullDiscount,
      };
      return parseVariantPricingPolicy(result);
    }
  } catch { invalid(); }
  return invalid();
}

export function canSaveVariantPolicy(input: Readonly<{
  variantId: string;
  expectedVariantVersion: number;
  expectedPolicyVersion: number;
  previewedPolicy: VariantPricingPolicy | null;
  candidatePolicy: VariantPricingPolicy;
  preview: VariantPolicyPreview | null;
}>): boolean {
  const selected = input.preview;
  if (!selected || !input.previewedPolicy || selected.newPriceCents === null
    || selected.variantId !== input.variantId
    || selected.variantVersion !== input.expectedVariantVersion
    || selected.policyVersion !== input.expectedPolicyVersion
    || selected.method !== input.candidatePolicy.method
    || !/^[a-f0-9]{64}$/.test(selected.scopeDigest)) return false;
  try { return JSON.stringify(input.previewedPolicy) === JSON.stringify(input.candidatePolicy); }
  catch { return false; }
}
