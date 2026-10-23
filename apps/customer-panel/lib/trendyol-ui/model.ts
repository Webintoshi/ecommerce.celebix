import { parseTrendyolPricingRule, type TrendyolPricingRule } from '@celebix/saas-contracts';

/** Parse a Turkish/decimal form amount into cents or basis points without binary-float multiplication. */
export function decimalUnits(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
export function unitInput(value: number): string {
  return `${Math.trunc(value / 100)}${value % 100 ? `.${String(value % 100).padStart(2, '0')}` : ''}`;
}
export type PricingDraft = Readonly<{
  commission: string; commissionVatIncluded: boolean; commissionVat: string;
  shipping: string; otherFee: string; productVat: string; withholding: string;
  coverWithholding: boolean; rounding: TrendyolPricingRule['rounding'];
}>;
export function pricingDraft(rule: TrendyolPricingRule): PricingDraft {
  return { commission: unitInput(rule.commissionBps), commissionVatIncluded: rule.commissionVatIncluded, commissionVat: unitInput(rule.commissionVatBps), shipping: unitInput(rule.averageShippingCents), otherFee: unitInput(rule.otherFeeCents), productVat: unitInput(rule.productVatBps), withholding: unitInput(rule.withholdingBps), coverWithholding: rule.coverWithholding, rounding: rule.rounding };
}
export function pricingFromDraft(draft: PricingDraft): TrendyolPricingRule | null {
  const values = [draft.commission, draft.commissionVat, draft.shipping, draft.otherFee, draft.productVat, draft.withholding].map(decimalUnits);
  if (values.some(value => value === null)) return null;
  try { return parseTrendyolPricingRule({ commissionBps: values[0], commissionVatIncluded: draft.commissionVatIncluded, commissionVatBps: values[1], averageShippingCents: values[2], otherFeeCents: values[3], productVatBps: values[4], withholdingBps: values[5], coverWithholding: draft.coverWithholding, rounding: draft.rounding }); } catch { return null; }
}
const MONEY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
export const money = (value: number) => MONEY.format(value / 100);
export function timeLabel(value: string | null): string { return value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Henüz tamamlanmadı'; }
export function errorCode(error: unknown): string { return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'unavailable'; }
/** Definitive failures may be edited; unknown outcomes must retry the same command first. */
export function definitiveFailure(code: string): boolean { return ['invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'feature_not_enabled', 'not_connected', 'needs_reconnect', 'operation_mismatch', 'version_conflict', 'provider_rejected', 'mapping_required', 'stock_conflict', 'quota_blocked'].includes(code); }
export function failureMessage(code: string): string {
  const messages: Record<string, string> = {
    invalid_package: 'Trendyol paket bilgileri doğrulanamadı. Satıcı panelindeki kaydı kontrol edin.', package_identity_conflict: 'Paket başka bir siparişle eşleşiyor. Trendyol kaydını kontrol edin.', invalid_line: 'Sipariş kalemlerinin tutar veya adet bilgileri doğrulanamadı. Trendyol kaydını kontrol edin.', ambiguous_split: 'Bölünen paketlerde aynı ürün satırı birden fazla kez görünüyor. Trendyol paketlerini kontrol edin.', invalid_timestamp: 'Sipariş tarihi doğrulanamadı. Trendyol kaydını kontrol edin.', unpacked_requires_reconciliation: 'Paket yeniden düzenleniyor. Trendyol paketlemesi tamamlandığında yeniden eşitleyin.', line_limit: 'Sipariş desteklenen ürün satırı sınırını aşıyor. Mağaza yöneticinize ulaşın.', order_deleted: 'Daha önce alınan sipariş silinmiş. Mağaza yöneticinizle kaydı kontrol edin.',
    provider_outcome_unknown: 'Gönderimin sonucu doğrulanamadı. Tekrar göndermeden önce Trendyol’daki ürünleri kontrol edin.', payment_pending: 'Siparişin ödemesi Trendyol tarafından kontrol ediliyor.', order_evidence_invalid: 'Sipariş bilgileri tutarlı değil. Trendyol kaydını kontrol edip yeniden eşitleyin.', provider_denied: 'Trendyol API yetkilerini kontrol edin.', stock_tracking_required: 'Aktarım için ürünün stok takibini açın ve kullanılabilir stok girin.', provider_error: 'Trendyol bağlantısını kontrol edip yeniden eşitleyin.',
    invalid_input: 'Bilgileri kontrol edin; yazdıklarınız korundu.', unauthenticated: 'Oturumunuzu yenileyip tekrar deneyin.', membership_denied: 'Bu işlem için mağaza yöneticinize ulaşın.', store_inactive: 'Mağaza şu anda işlem yapamıyor.', feature_not_enabled: 'Pazar yeri entegrasyonu için paketinizin uygunluğunu kontrol edin.', not_connected: 'Önce Trendyol hesabınızı bağlayın.', needs_reconnect: 'Trendyol bağlantı bilgilerini yenileyin.', operation_mismatch: 'İşlem sonucu eşleşmedi. Durumu yenileyip bilgileri kontrol edin.', version_conflict: 'Ayarlar başka bir işlemde değişti. Yazdıklarınız korundu; güncel sürümle tekrar kaydedebilirsiniz.', commit_unknown: 'İşlemin sonucu doğrulanamadı. Aynı işlemi tekrar kontrol edin.', unavailable: 'İşlem tamamlanamadı. Bilgileriniz korundu; tekrar deneyin.', rate_limited: 'Trendyol kısa süre beklemenizi istiyor. Biraz sonra tekrar deneyin.', provider_rejected: 'Trendyol bilgileri kabul etmedi. Bağlantıyı ve ürün bilgilerini kontrol edin.', mapping_required: 'Ürün eşlemesindeki eksik bilgileri tamamlayın.', stock_conflict: 'Sipariş için kullanılabilir stok yetersiz. Stokları kontrol edip tekrar deneyin.', quota_blocked: 'Paket kullanım sınırına ulaşıldı. Paket seçeneklerini kontrol edin.',
  };
  return messages[code] ?? messages.unavailable!;
}
export const PRODUCT_STATUS = {
  not_configured: { label: 'Eşleme bekliyor', tone: 'neutral' }, queued: { label: 'Sırada', tone: 'neutral' }, submitted: { label: 'Trendyol’a gönderildi', tone: 'neutral' }, active: { label: 'Trendyol’da aktif', tone: 'success' }, failed: { label: 'İşlem gerekli', tone: 'warning' }, excluded: { label: 'Aktarım kapalı', tone: 'neutral' },
} as const;
