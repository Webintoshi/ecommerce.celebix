import type {EmailMarketingConnection, EmailMarketingProvider} from '@celebix/saas-contracts';
export const EMAIL_SERVICES = Object.freeze([
  {provider: 'brevo' as const, name: 'Brevo', description: 'E-posta kampanyaları ve kişi listeleri.', accountUrl: 'https://app.brevo.com/account/register', campaignUrl: 'https://app.brevo.com/campaign/listing', pricingUrl: 'https://www.brevo.com/pricing/'},
  {provider: 'klaviyo' as const, name: 'Klaviyo', description: 'E-posta kampanyaları ve otomasyonlar.', accountUrl: 'https://www.klaviyo.com/sign-up', campaignUrl: 'https://www.klaviyo.com/campaigns', pricingUrl: 'https://www.klaviyo.com/pricing'},
]);
export function emailMarketingCount(value: number | null) { return value === null ? 'Bilinmiyor' : new Intl.NumberFormat('tr-TR').format(value); }
export function emailMarketingCode(value: unknown): string {
  return value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' ? value.code : 'provider_unavailable';
}
export function emailMarketingErrorMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    outcome_unknown: 'İşlemin sonucu henüz doğrulanamadı. Seçiminiz korundu; aynı işlemi tekrar deneyin.',
    candidate_expired: 'Anahtar kontrolünün süresi doldu. Liste seçiminiz korundu; anahtarı yeniden kontrol edin.',
    version_conflict: 'Bağlantı başka bir işlemde değişti. Güncel bilgileri alıp tekrar deneyin.',
    operation_conflict: 'İşlem bilgileri uyuşmuyor. Bağlantıyı yeniden kontrol edin.',
    account_in_use: 'Bu servis hesabı başka bir mağazaya bağlı. Bu mağazaya özel bir hesap kullanın.',
    account_mismatch: 'Yeni anahtar mevcut servis hesabına ait olmalı.',
    provider_unauthorized: 'API anahtarı geçersiz veya süresi dolmuş. Yeni anahtarı kontrol edin.',
    provider_forbidden: 'Anahtarın kişi ve liste işlemleri için gerekli yetkileri bulunmuyor.',
    provider_rate_limited: 'Servisin işlem sınırına ulaşıldı. Bir süre sonra aynı işlemi tekrar deneyin.',
    cleanup_pending: 'Önceki bağlantının temizliği sürüyor. Tamamlandığında yeniden bağlayabilirsiniz.',
    not_configured: 'E-posta bağlantıları henüz kullanıma açılmadı.',
    forbidden: 'Bu işlem için bağlantı yönetimi yetkisi gerekiyor.',
    unauthorized: 'Oturumunuz sona erdi. Yeniden giriş yapın.',
    invalid_input: 'Anahtar ve liste bilgilerini kontrol edin.',
  };
  return messages[code] ?? 'E-posta servisine ulaşılamadı. Bilgileriniz korundu; yeniden deneyin.';
}
export function emailMarketingStatus(connection?: EmailMarketingConnection) {
  return connection ? ({connected: 'Bağlı', disconnected: 'Bağlı değil', draining: 'Bağlantı kaldırılıyor', needs_reconnect: 'Anahtar yenilenmeli', error: 'Kontrol gerekiyor'}[connection.status]) : 'Bağlı değil';
}
export function emailMarketingDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('tr-TR', {dateStyle: 'short', timeStyle: 'short'}).format(new Date(value)) : 'Henüz kontrol edilmedi';
}
export function serviceName(provider: EmailMarketingProvider) { return EMAIL_SERVICES.find(s => s.provider === provider)!.name; }
