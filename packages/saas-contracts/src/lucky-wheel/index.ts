import { parsePromotionRuleDocument } from '../promotions/validation.ts';
import type { PromotionRuleDocument } from '../promotions/types.ts';
import { normalizeStoreEngagementEmail, normalizeStoreEngagementPhone } from '../store-engagement/index.ts';
export type LuckyWheelAppearance = Readonly<{
    sliceA: string;
    sliceB: string;
    background: string;
    accent: string;
}>;
export type LuckyWheelPrizeInput = Readonly<{
    id: string;
    promotionId: string;
    weightBps: number;
    issuanceLimit: number | null;
}>;
export type LuckyWheelConfig = Readonly<{
    schemaVersion: 1;
    heading: string;
    body: string;
    appearance: LuckyWheelAppearance;
    collectMode: 'email' | 'phone' | 'either';
    repeatDays: number;
    couponHours: number;
    marketingOptInLabel: string;
    devices: Readonly<{
        desktop: boolean;
        mobile: boolean;
    }>;
    allowedPaths: readonly string[];
    scrollPercent: number | null;
    startsAt: string | null;
    endsAt: string | null;
    prizes: readonly LuckyWheelPrizeInput[];
}>;
export type LuckyWheelPrize = LuckyWheelPrizeInput & Readonly<{
    rewardRevisionId: string;
    managedPromotionId: string;
    label: string;
    issued: number;
    used: number;
    ruleDocument: PromotionRuleDocument;
}>;
export type LuckyWheelBlockedReason = 'quota_exhausted' | 'promotion_unavailable' | 'scheduled' | 'ended' | 'legacy_configuration';
export type LuckyWheelCampaign = Readonly<{
    id: string;
    name: string;
    enabled: boolean;
    status: 'active' | 'paused' | 'archived';
    version: number;
    config: LuckyWheelConfig | null;
    prizes: readonly LuckyWheelPrize[];
    blockedReason: LuckyWheelBlockedReason | null;
    stats: Readonly<{
        issued: number;
        used: number;
        discountMinor: number;
        revenueMinor: number;
        currency: string;
    }>;
    createdAt: string;
    updatedAt: string;
    legacy: boolean;
    legacyConfig: Readonly<Record<string, unknown>> | null;
}>;
/** Display rule only: the neutral trigger is never submitted to the executable promotion engine. */
export type LuckyWheelPublicPrize = Readonly<{
    id: string;
    label: string;
    weightBps: number;
    ruleDocument: PromotionRuleDocument;
}>;
export type LuckyWheelPublicCampaign = Readonly<{
    id: string;
    version: number;
    heading: string;
    body: string;
    appearance: LuckyWheelAppearance;
    collectMode: LuckyWheelConfig['collectMode'];
    repeatDays: number;
    couponHours: number;
    marketingOptInLabel: string;
    devices: LuckyWheelConfig['devices'];
    allowedPaths: readonly string[];
    scrollPercent: number | null;
    prizes: readonly LuckyWheelPublicPrize[];
}>;
export type LuckyWheelPublicSettings = Readonly<{
    campaign: LuckyWheelPublicCampaign | null;
}>;
export type LuckyWheelSpinRequest = Readonly<{
    operationId: string;
    campaignId: string;
    expectedVersion: number;
    email?: string;
    phone?: string;
    marketingConsent: boolean;
}>;
export type LuckyWheelSpinResult = Readonly<{
    operationId: string;
    campaignId: string;
    campaignVersion: number;
    awardId: string;
    prizeId: string;
    label: string;
    couponCode: string;
    expiresAt: string;
    awardedAt: string;
    repeatEligibleAt: string;
    ruleDocument: PromotionRuleDocument;
    couponStatus: 'active' | 'held' | 'used' | 'revoked' | 'expired';
}>;
export type LuckyWheelDeleteResult = Readonly<{
    campaignId: string;
    deleted: true;
    issuedCouponsPreserved: true;
}>;
export type LuckyWheelRevokeResult = Readonly<{
    campaignId: string;
    revoked: number;
    held: number;
}>;
export type LuckyWheelHistoryResult = Readonly<{
    items: readonly Readonly<{
        id: string;
        action: 'created' | 'updated' | 'deleted' | 'coupons_revoked';
        version: number;
        at: string;
        actorLabel: string;
    }>[];
    hasMore: boolean;
}>;
export class LuckyWheelContractError extends Error {
    constructor() { super('lucky_wheel_contract_invalid'); this.name = 'LuckyWheelContractError'; }
}
function invalid(): never { throw new LuckyWheelContractError(); }
function guarded<T>(read: () => T): T { try {
    return read();
}
catch {
    invalid();
} }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid(); const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors), allowed = new Set([...required, ...optional]), output: Record<string, unknown> = {}; if (required.some(k => !Object.hasOwn(descriptors, k)))
    invalid(); for (const k of keys) {
    if (typeof k !== 'string' || !allowed.has(k))
        invalid();
    const d = descriptors[k];
    if (!d || !('value' in d) || !d.enumerable)
        invalid();
    output[k] = d.value;
} return output; }
function text(x: unknown, min: number, max: number): string { if (typeof x !== 'string' || x !== x.trim() || x.length < min || x.length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(x) || /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(x))
    invalid(); return x; }
export function luckyWheelUuid(x: unknown): string { const s = text(x, 36, 36); if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(s))
    invalid(); return s; }
function integer(x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(x) || (x as number) < min || (x as number) > max)
    invalid(); return x as number; }
function bool(x: unknown): boolean { if (typeof x !== 'boolean')
    invalid(); return x; }
function choice<T extends string>(x: unknown, values: readonly T[]): T { if (typeof x !== 'string' || !values.includes(x as T))
    invalid(); return x as T; }
function timestamp(x: unknown): string { const s = text(x, 24, 24); if (new Date(s).toISOString() !== s)
    invalid(); return s; }
function list<T>(x: unknown, min: number, max: number, parse: (x: unknown) => T): readonly T[] { if (!Array.isArray(x) || Object.getPrototypeOf(x) !== Array.prototype || x.length < min || x.length > max || Reflect.ownKeys(Object.getOwnPropertyDescriptors(x)).length !== x.length + 1)
    invalid(); return Object.freeze(x.map((_, i) => { const d = Object.getOwnPropertyDescriptor(x, String(i)); if (!d || !('value' in d) || !d.enumerable)
    invalid(); return parse(d.value); })); }
function unique<T>(xs: readonly T[], key: (x: T) => string): readonly T[] { if (new Set(xs.map(key)).size !== xs.length)
    invalid(); return xs; }
function appearance(x: unknown): LuckyWheelAppearance { const r = exact(x, ['sliceA', 'sliceB', 'background', 'accent']); for (const c of Object.values(r))
    if (typeof c !== 'string' || !/^#[a-fA-F0-9]{6}$/u.test(c))
        invalid(); return Object.freeze(r as LuckyWheelAppearance); }
function devices(x: unknown) { const r = exact(x, ['desktop', 'mobile']), desktop = bool(r.desktop), mobile = bool(r.mobile); if (!desktop && !mobile)
    invalid(); return Object.freeze({ desktop, mobile }); }
function paths(x: unknown) { return unique(list(x, 0, 30, p => { const s = text(p, 1, 200); if (!/^\/(?:[a-zA-Z0-9_~.-]+\/?)*$/u.test(s) || /^\/(?:checkout|account|payment|odeme|hesap)(?:\/|$)/iu.test(s) || s.includes('..'))
    invalid(); return s; }), x => x); }
function prizeInput(x: unknown): LuckyWheelPrizeInput { const r = exact(x, ['id', 'promotionId', 'weightBps', 'issuanceLimit']); return Object.freeze({ id: luckyWheelUuid(r.id), promotionId: luckyWheelUuid(r.promotionId), weightBps: integer(r.weightBps, 1, 10000), issuanceLimit: r.issuanceLimit === null ? null : integer(r.issuanceLimit, 1, 1000000000) }); }
const configKeys = ['schemaVersion', 'heading', 'body', 'appearance', 'collectMode', 'repeatDays', 'couponHours', 'marketingOptInLabel', 'devices', 'allowedPaths', 'scrollPercent', 'startsAt', 'endsAt', 'prizes'] as const;
export function parseLuckyWheelConfig(x: unknown): LuckyWheelConfig { return guarded(() => { const r = exact(x, configKeys); if (r.schemaVersion !== 1)
    invalid(); const prizes = unique(list(r.prizes, 4, 8, prizeInput), p => p.id); if (prizes.reduce((s, p) => s + p.weightBps, 0) !== 10000)
    invalid(); const startsAt = r.startsAt === null ? null : timestamp(r.startsAt), endsAt = r.endsAt === null ? null : timestamp(r.endsAt); if (startsAt && endsAt && endsAt <= startsAt)
    invalid(); return Object.freeze({ schemaVersion: 1, heading: text(r.heading, 1, 120), body: text(r.body, 0, 1000), appearance: appearance(r.appearance), collectMode: choice(r.collectMode, ['email', 'phone', 'either']), repeatDays: integer(r.repeatDays, 1, 90), couponHours: integer(r.couponHours, 1, 720), marketingOptInLabel: text(r.marketingOptInLabel, 1, 240), devices: devices(r.devices), allowedPaths: paths(r.allowedPaths), scrollPercent: r.scrollPercent === null ? null : integer(r.scrollPercent, 1, 100), startsAt, endsAt, prizes }); }); }
export function createDefaultLuckyWheelConfig(): LuckyWheelConfig { return parseLuckyWheelConfig({ schemaVersion: 1, heading: 'Şansını dene, indirim kazan', body: 'Ödüllerin kazanma oranları farklı olabilir.', appearance: { sliceA: '#ffffff', sliceB: '#ede9fe', background: '#ffffff', accent: '#7c3aed' }, collectMode: 'either', repeatDays: 7, couponHours: 24, marketingOptInLabel: 'Kampanya ve fırsat mesajlarını almak istiyorum.', devices: { desktop: true, mobile: true }, allowedPaths: [], scrollPercent: null, startsAt: null, endsAt: null, prizes: Array.from({ length: 6 }, (_, i) => ({ id: `22600000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, promotionId: '22600000-0000-4000-8000-000000000000', weightBps: i < 4 ? 1667 : 1666, issuanceLimit: null })) }); }
export function isLuckyWheelPromotionEligible(x: unknown): boolean { try {
    const r = parsePromotionRuleDocument(x);
    return ['percentage', 'fixed_amount', 'free_shipping'].includes(r.benefit.kind) && (r.benefit.kind !== 'fixed_amount' || r.benefit.currency === 'TRY') && r.audience.mode === 'everyone' && r.limits.perCustomerUsage === null && r.limits.totalUsage === null && r.limits.budgetMinor === null && (!r.conditions.salesChannels || r.conditions.salesChannels.includes('storefront'));
}
catch {
    return false;
} }
function eligibleRule(x: unknown): PromotionRuleDocument { const r = parsePromotionRuleDocument(x); if (!isLuckyWheelPromotionEligible(r))
    invalid(); return r; }
function money(amount: number, currency = 'TRY') { return `${(amount / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'TRY' ? '₺' : currency}`; }
export function luckyWheelRewardLabel(x: PromotionRuleDocument): string { const r = eligibleRule(x); if (r.benefit.kind === 'percentage')
    return `%${(r.benefit.percentageBps / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} indirim`; if (r.benefit.kind === 'fixed_amount')
    return `${money(r.benefit.amountMinor, r.benefit.currency)} indirim`; return 'Ücretsiz kargo'; }
export function luckyWheelRewardConditions(x: PromotionRuleDocument): readonly string[] { const r = eligibleRule(x), rows: string[] = []; if (r.conditions.minimumBasketMinor)
    rows.push(`En az ${money(r.conditions.minimumBasketMinor, r.benefit.kind === 'fixed_amount' ? r.benefit.currency : 'TRY')} sepet tutarı.`); if (r.conditions.minimumQuantity)
    rows.push(`Sepette en az ${r.conditions.minimumQuantity} ürün.`); if (r.conditions.minimumProductQuantity)
    rows.push(`Uygun üründen en az ${r.conditions.minimumProductQuantity} adet.`); if (r.targets.mode === 'selected' || r.targets.exclude.length)
    rows.push('Yalnız kampanyaya dahil ürünlerde geçerlidir.'); if (r.limits.orderMaximumMinor !== null)
    rows.push(`En fazla ${money(r.limits.orderMaximumMinor)} indirim.`); if (r.conditions.paymentMethodIds)
    rows.push('Seçili ödeme yöntemlerinde geçerlidir.'); if (r.conditions.shippingMethodIds)
    rows.push('Seçili kargo yöntemlerinde geçerlidir.'); rows.push('Yalnız internet mağazasında geçerlidir.'); if (r.combinationPolicy.kind === 'none')
    rows.push('Diğer indirimlerle birleştirilemez.'); if (r.combinationPolicy.kind === 'shipping_only')
    rows.push('Yalnız kargo indirimleriyle birleştirilebilir.'); if (r.combinationPolicy.kind === 'benefit_classes')
    rows.push('Yalnız izin verilen indirim türleriyle birleştirilebilir.'); if (r.schedule.startsAt)
    rows.push(`Geçerlilik başlangıcı: ${r.schedule.startsAt}`); if (r.schedule.endsAt)
    rows.push(`Koşulların son geçerlilik zamanı: ${r.schedule.endsAt}`); return Object.freeze(rows); }
function prize(x: unknown): LuckyWheelPrize { const r = exact(x, ['id', 'promotionId', 'weightBps', 'issuanceLimit', 'rewardRevisionId', 'managedPromotionId', 'label', 'issued', 'used', 'ruleDocument']); const { rewardRevisionId, managedPromotionId, label, issued, used, ruleDocument, ...base } = r, p = prizeInput(base), rule = eligibleRule(ruleDocument); if (label !== luckyWheelRewardLabel(rule))
    invalid(); return Object.freeze({ ...p, rewardRevisionId: luckyWheelUuid(rewardRevisionId), managedPromotionId: luckyWheelUuid(managedPromotionId), label: label as string, issued: integer(issued), used: integer(used), ruleDocument: rule }); }
export function parseLuckyWheelCampaign(x: unknown): LuckyWheelCampaign { return guarded(() => { const r = exact(x, ['id', 'name', 'enabled', 'status', 'version', 'config', 'prizes', 'blockedReason', 'stats', 'createdAt', 'updatedAt', 'legacy', 'legacyConfig']); const legacy = bool(r.legacy), enabled = bool(r.enabled), config = r.config === null ? null : parseLuckyWheelConfig(r.config), prizes = unique(list(r.prizes, legacy ? 0 : 4, legacy ? 0 : 8, prize), p => p.id), blockedReason = r.blockedReason === null ? null : choice(r.blockedReason, ['quota_exhausted', 'promotion_unavailable', 'scheduled', 'ended', 'legacy_configuration']), s = exact(r.stats, ['issued', 'used', 'discountMinor', 'revenueMinor', 'currency']), createdAt = timestamp(r.createdAt), updatedAt = timestamp(r.updatedAt); if (updatedAt < createdAt || legacy && (config !== null || enabled || blockedReason !== 'legacy_configuration') || !legacy && (config === null || r.legacyConfig !== null) || config && (config.prizes.length !== prizes.length || config.prizes.some((p, i) => JSON.stringify(p) !== JSON.stringify({ id: prizes[i]?.id, promotionId: prizes[i]?.promotionId, weightBps: prizes[i]?.weightBps, issuanceLimit: prizes[i]?.issuanceLimit }))))
    invalid(); if (typeof s.currency !== 'string' || !/^[A-Z]{3}$/u.test(s.currency))
    invalid(); const issued = integer(s.issued), used = integer(s.used); if (used > issued)
    invalid(); if (r.legacyConfig !== null && (typeof r.legacyConfig !== 'object' || Array.isArray(r.legacyConfig)))
    invalid(); return Object.freeze({ id: luckyWheelUuid(r.id), name: text(r.name, 1, 160), enabled, status: choice(r.status, ['active', 'paused', 'archived']), version: integer(r.version, 1), config, prizes, blockedReason, stats: Object.freeze({ issued, used, discountMinor: integer(s.discountMinor), revenueMinor: integer(s.revenueMinor), currency: s.currency }), createdAt, updatedAt, legacy, legacyConfig: r.legacyConfig as LuckyWheelCampaign['legacyConfig'] }); }); }
export function parseLuckyWheelPublicCampaign(x: unknown): LuckyWheelPublicCampaign { return guarded(() => { const r = exact(x, ['id', 'version', 'heading', 'body', 'appearance', 'collectMode', 'repeatDays', 'couponHours', 'marketingOptInLabel', 'devices', 'allowedPaths', 'scrollPercent', 'prizes']), prizes = unique(list(r.prizes, 4, 8, p => { const v = exact(p, ['id', 'label', 'weightBps', 'ruleDocument']), ruleDocument = eligibleRule(v.ruleDocument); if (ruleDocument.trigger.kind !== 'automatic' || v.label !== luckyWheelRewardLabel(ruleDocument))
    invalid(); return Object.freeze({ id: luckyWheelUuid(v.id), label: v.label as string, weightBps: integer(v.weightBps, 1, 10000), ruleDocument }); }), p => p.id); if (prizes.reduce((s, p) => s + p.weightBps, 0) !== 10000)
    invalid(); return Object.freeze({ id: luckyWheelUuid(r.id), version: integer(r.version, 1), heading: text(r.heading, 1, 120), body: text(r.body, 0, 1000), appearance: appearance(r.appearance), collectMode: choice(r.collectMode, ['email', 'phone', 'either']), repeatDays: integer(r.repeatDays, 1, 90), couponHours: integer(r.couponHours, 1, 720), marketingOptInLabel: text(r.marketingOptInLabel, 1, 240), devices: devices(r.devices), allowedPaths: paths(r.allowedPaths), scrollPercent: r.scrollPercent === null ? null : integer(r.scrollPercent, 1, 100), prizes }); }); }
export function parseLuckyWheelPublicSettings(x: unknown): LuckyWheelPublicSettings { return guarded(() => { const r = exact(x, ['campaign']); return Object.freeze({ campaign: r.campaign === null ? null : parseLuckyWheelPublicCampaign(r.campaign) }); }); }
export function parseLuckyWheelSpinRequest(x: unknown): LuckyWheelSpinRequest { return guarded(() => { const r = exact(x, ['operationId', 'campaignId', 'expectedVersion', 'marketingConsent'], ['email', 'phone']); if (Object.hasOwn(r, 'email') === Object.hasOwn(r, 'phone'))
    invalid(); return Object.freeze({ operationId: luckyWheelUuid(r.operationId), campaignId: luckyWheelUuid(r.campaignId), expectedVersion: integer(r.expectedVersion, 1), marketingConsent: bool(r.marketingConsent), ...(Object.hasOwn(r, 'email') ? { email: normalizeStoreEngagementEmail(r.email) } : { phone: normalizeStoreEngagementPhone(r.phone) }) }); }); }
export function parseLuckyWheelSpinResult(x: unknown): LuckyWheelSpinResult { return guarded(() => { const r = exact(x, ['operationId', 'campaignId', 'campaignVersion', 'awardId', 'prizeId', 'label', 'couponCode', 'expiresAt', 'awardedAt', 'repeatEligibleAt', 'ruleDocument', 'couponStatus']), ruleDocument = eligibleRule(r.ruleDocument), awardedAt = timestamp(r.awardedAt), expiresAt = timestamp(r.expiresAt), repeatEligibleAt = timestamp(r.repeatEligibleAt); if (expiresAt <= awardedAt || repeatEligibleAt <= awardedAt || r.label !== luckyWheelRewardLabel(ruleDocument) || typeof r.couponCode !== 'string' || !/^W-[A-F0-9]{32}$/u.test(r.couponCode) || ruleDocument.trigger.kind !== 'code' || ruleDocument.trigger.codes.length !== 1 || ruleDocument.trigger.codes[0] !== r.couponCode)
    invalid(); return Object.freeze({ operationId: luckyWheelUuid(r.operationId), campaignId: luckyWheelUuid(r.campaignId), campaignVersion: integer(r.campaignVersion, 1), awardId: luckyWheelUuid(r.awardId), prizeId: luckyWheelUuid(r.prizeId), label: r.label as string, couponCode: r.couponCode, expiresAt, awardedAt, repeatEligibleAt, ruleDocument, couponStatus: choice(r.couponStatus, ['active', 'held', 'used', 'revoked', 'expired']) }); }); }
export function parseLuckyWheelDeleteResult(x: unknown): LuckyWheelDeleteResult { return guarded(() => { const r = exact(x, ['campaignId', 'deleted', 'issuedCouponsPreserved']); if (r.deleted !== true || r.issuedCouponsPreserved !== true)
    invalid(); return Object.freeze({ campaignId: luckyWheelUuid(r.campaignId), deleted: true, issuedCouponsPreserved: true }); }); }
export function parseLuckyWheelRevokeResult(x: unknown): LuckyWheelRevokeResult { return guarded(() => { const r = exact(x, ['campaignId', 'revoked', 'held']); return Object.freeze({ campaignId: luckyWheelUuid(r.campaignId), revoked: integer(r.revoked), held: integer(r.held) }); }); }
export function parseLuckyWheelHistoryResult(x: unknown): LuckyWheelHistoryResult { return guarded(() => { const r = exact(x, ['items', 'hasMore']); return Object.freeze({ items: unique(list(r.items, 0, 100, x => { const v = exact(x, ['id', 'action', 'version', 'at', 'actorLabel']); return Object.freeze({ id: luckyWheelUuid(v.id), action: choice(v.action, ['created', 'updated', 'deleted', 'coupons_revoked']), version: integer(v.version, 1), at: timestamp(v.at), actorLabel: text(v.actorLabel, 1, 160) }); }), x => x.id), hasMore: bool(r.hasMore) }); }); }
export type LuckyWheelManagedPromotionIndex = Readonly<{
    items: readonly Readonly<{
        promotionId: string;
        campaignId: string;
        campaignName: string;
        issued: number;
        used: number;
        deleted: boolean;
    }>[];
    hasMore: boolean;
    nextCursor: string | null;
}>;
export function parseLuckyWheelManagedPromotionIndex(x: unknown): LuckyWheelManagedPromotionIndex { return guarded(() => { const r = exact(x, ['items', 'hasMore', 'nextCursor']), items = unique(list(r.items, 0, 200, x => { const v = exact(x, ['promotionId', 'campaignId', 'campaignName', 'issued', 'used', 'deleted']), issued = integer(v.issued), used = integer(v.used); if (used > issued)
    invalid(); return Object.freeze({ promotionId: luckyWheelUuid(v.promotionId), campaignId: luckyWheelUuid(v.campaignId), campaignName: text(v.campaignName, 1, 160), issued, used, deleted: bool(v.deleted) }); }), x => x.promotionId), hasMore = bool(r.hasMore), nextCursor = r.nextCursor === null ? null : text(r.nextCursor, 61, 61); if (hasMore !== (nextCursor !== null) || hasMore && items.length === 0)
    invalid(); if (nextCursor) {
    const [at, id] = nextCursor.split('|');
    timestamp(at);
    luckyWheelUuid(id);
} return Object.freeze({ items, hasMore, nextCursor }); }); }
