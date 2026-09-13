import { createPromotionDraft, promotionRuleDocument, updatePromotionDraft } from "../../../../../../apps/customer-panel/lib/promotion-ui/model.ts";

export const PROMOTION_ID = "93000000-0000-4000-8000-000000000001";
export const PROMOTION_NOW = "2026-09-09T09:00:00.000Z";
export const PROMOTION_NOW_MICROSECONDS = "2026-09-09T09:00:00.000000Z";
export const PROMOTION_TIMEZONE = "Europe/Istanbul";

const draft = updatePromotionDraft(createPromotionDraft("influencer_code", PROMOTION_TIMEZONE), {
  name: "Mira kontrollü kampanya",
  codeInput: "MIRA15",
  codes: ["MIRA15"],
  startsAt: "2026-09-10T09:00:00.000Z",
  endsAt: "2026-10-10T09:00:00.000Z",
});

export const PROMOTION = Object.freeze({
  id: PROMOTION_ID,
  version: 2,
  name: draft.name,
  status: "draft" as const,
  ruleDocument: promotionRuleDocument(draft),
  createdAt: PROMOTION_NOW,
  updatedAt: PROMOTION_NOW,
});

export const PROMOTION_LIST_ITEM = Object.freeze({
  id: PROMOTION_ID,
  version: PROMOTION.version,
  name: PROMOTION.name,
  status: PROMOTION.status,
  effectiveStatus: "draft" as const,
  triggerKind: "code" as const,
  benefitKind: "percentage" as const,
  audienceMode: "everyone" as const,
  humanMechanic: "%15 indirim · MIRA15 kupon kodu",
  startsAt: PROMOTION.ruleDocument.schedule.startsAt ?? null,
  endsAt: PROMOTION.ruleDocument.schedule.endsAt ?? null,
  usage: Object.freeze({ used: 0, budgetMinor: 0 }),
  financials: Object.freeze([]),
  activeCodeCount: 1,
  createdAt: PROMOTION_NOW_MICROSECONDS,
  updatedAt: PROMOTION_NOW_MICROSECONDS,
});
