import 'server-only';
import { parseContactWidgetConfig, type MerchantAdminRecord, type StorefrontPolicyKey, type TenantContext } from '@celebix/saas-contracts';
import type { MerchantAdminRepository } from '@celebix/saas-data';
import type { PolicyMerchantFacts } from './service.ts';

const KINDS = ['general_setting', 'shipping_setting', 'contact_widget', 'accounting_profile'] as const;
function text(value: unknown, maximum = 600): string | null {
  if (typeof value !== 'string') return null;
  const selected = value.trim();
  return selected && Buffer.byteLength(selected, 'utf8') <= maximum && !/[<>\u0000-\u001f\u007f-\u009f]/u.test(selected) ? selected : null;
}
export function buildPolicyMerchantFacts(records: readonly MerchantAdminRecord[], policyKey: StorefrontPolicyKey): PolicyMerchantFacts {
  const facts: { ref: string; label: string; value: string }[] = [];
  const only = (kind: typeof KINDS[number]) => { const active = records.filter(record => record.kind === kind && record.status === 'active'); return active.length === 1 ? active[0]! : null; };
  function add(record: MerchantAdminRecord | null, key: string, label: string, raw: unknown) {
    const value = text(raw, 1000); if (record && value) facts.push(Object.freeze({ ref: `${record.id}:${record.version}:${key}`, label, value }));
  }
  const general = only('general_setting'), accounting = only('accounting_profile'), shipping = only('shipping_setting'), contact = only('contact_widget');
  add(general, 'displayName', 'Mağazanın görünen adı; resmî unvan olduğu doğrulanmamıştır', general?.config.storeDisplayName);
  const supportEmail = text(general?.config.supportEmail);
  if (supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(supportEmail)) add(general, 'supportEmail', 'Kayıtlı destek e-postası', supportEmail);
  for (const [key, label] of [['legalName', 'İşletmenin kayıtlı resmî unvanı'], ['invoiceEmail', 'Fatura iletişim e-postası; genel başvuru kanalı olduğu doğrulanmamıştır']] as const) add(accounting, key, label, accounting?.config[key]);
  if (shipping) {
    const regions = shipping.config.regions;
    if (Array.isArray(regions) && regions.length <= 10 && regions.every(region => text(region, 80))) add(shipping, 'regions', 'Kayıtlı teslimat bölgeleri', regions.join(', '));
    const days = shipping.config.estimatedDays;
    if (Number.isSafeInteger(days) && (days as number) >= 1 && (days as number) <= 365) add(shipping, 'estimatedDays', 'Tahmini teslimat süresi, gün; teslim garantisi değildir', String(days));
    for (const [key, label] of [['shippingPriceCents', 'Kayıtlı kargo bedeli'], ['freeShippingThresholdCents', 'Kayıtlı ücretsiz kargo alt sınırı']] as const) {
      const cents = shipping.config[key];
      if (Number.isSafeInteger(cents) && (cents as number) >= 0 && (cents as number) <= 100_000_000) {
        const amount = cents as number;
        add(shipping, key, label, `${Math.floor(amount / 100)},${String(amount % 100).padStart(2, '0')} TL`);
      }
    }
  }
  if (contact) {
    try { const widget = parseContactWidgetConfig(contact.config); if (widget.enabled) for (const channel of widget.channels) if (channel.enabled && (channel.type === 'phone' || channel.type === 'email')) add(contact, `contact.${channel.type}`, channel.type === 'phone' ? 'Mağaza iletişim telefonu' : 'Mağaza iletişim e-postası', channel.value); } catch { /* Invalid optional widget data cannot establish a merchant fact. */ }
  }
  const missing: string[] = [];
  const has = (key: string) => facts.some(fact => fact.ref.endsWith(`:${key}`));
  if (!has('legalName')) missing.push('İşletmenin resmî unvanını ve veri sorumlusu/satıcı kimliğini kontrol edin.');
  if (['distance_sales', 'kvkk', 'returns_exchanges'].includes(policyKey)) missing.push('Resmî başvuru veya iade adresini doğrulayın; kayıtlı iletişim bilgileri adres yerine geçmez.');
  if (!has('supportEmail') && !has('contact.phone') && !has('contact.email')) missing.push('Müşterilerin kullanacağı güncel iletişim kanalını doğrulayın.');
  const scopeNotes: Record<StorefrontPolicyKey, string> = {
    privacy_security: 'Gerçekte yürütülen veri işleme ve güvenlik uygulamalarını kontrol edin.',
    distance_sales: 'Siparişe özgü bedel, masraf, ürün ve ön bilgilendirme koşullarını ayrıca kontrol edin.',
    kvkk: 'İşleme amaçlarını, hukuki sebepleri, veri alıcılarını ve başvuru yöntemini işletmenin gerçek süreçleriyle doğrulayın.',
    payment_delivery: 'Etkin ödeme yöntemlerini ve müşteriye gösterilen teslimat/ücret koşullarını doğrulayın.',
    cookie_usage: 'Gerçekte kullanılan çerezleri, sağlayıcılarını, sürelerini ve varsa tercih/izin uygulamasını doğrulayın.',
    returns_exchanges: 'İade, cayma, ayıplı ürün ve gönüllü değişim süreçlerinin gerçek koşullarını kontrol edin.',
    membership: 'Kullanılan üyelik, hesap kapatma ve iletişim süreçlerini doğrulayın.',
  };
  missing.push(scopeNotes[policyKey]);
  return Object.freeze({ facts: Object.freeze(facts), missing: Object.freeze(missing) });
}
export async function loadPolicyMerchantFacts(input: Readonly<{ merchantAdmin: Pick<MerchantAdminRepository, 'list'>; tenantContext: TenantContext; now: Date; policyKey: StorefrontPolicyKey; includeAccounting: boolean }>): Promise<PolicyMerchantFacts> {
  const selected = KINDS.filter(kind => kind !== 'accounting_profile' || input.includeAccounting);
  const groups = await Promise.all(selected.map(async kind => {
    try { return await input.merchantAdmin.list({ tenantContext: input.tenantContext, now: input.now, kind }); }
    catch (error) {
      const descriptor = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : null;
      const code = descriptor && 'value' in descriptor ? descriptor.value : null;
      if (['feature_not_enabled', 'membership_denied', 'permission_denied'].includes(String(code))) return [];
      throw error;
    }
  }));
  return buildPolicyMerchantFacts(groups.flat(), input.policyKey);
}
