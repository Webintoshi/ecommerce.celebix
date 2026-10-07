import { parseGoogleMarketingSelection, type GoogleMarketingConnection, type GoogleMarketingSelection, type GoogleMarketingService } from "@celebix/saas-contracts";
import type { ApplyInput, DisconnectInput } from "./client";

export const SERVICES = Object.freeze([
  { service: "gtm" as const, name: "Google Tag Manager", description: "Mağazanızın Google etiketlerini tek konteynerden yönetin.", resourceLabel: "Web konteyneri" },
  { service: "ads" as const, name: "Google Ads", description: "Ödemesi tamamlanan web siparişlerini satın alma dönüşümü olarak ölçün.", resourceLabel: "Satın alma dönüşümü" },
  { service: "search_console" as const, name: "Google Search Console", description: "Mağazanızın sitesini doğrulayın ve site haritasını gönderin.", resourceLabel: "Site" },
]);
export function emptyConnection(service: GoogleMarketingService): GoogleMarketingConnection { return { service, version: 0, status: "disconnected", googleEmail: null, selection: null, lastCheckedAt: null, errorCode: null }; }
export function statusLabel(connection: GoogleMarketingConnection): string {
  if (connection.status === "connected") return "Bağlı";
  if (connection.status === "needs_reconnect") return "Yeniden bağlantı gerekli";
  if (connection.status === "error") return "Bağlantı kontrol edilemedi";
  return connection.googleEmail ? "Kurulum bekliyor" : "Bağlı değil";
}
export function errorCode(error: unknown): string { return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unavailable"; }
export function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    oauth_unconfigured: "Google bağlantısı platformda henüz yapılandırılmadı. Platform desteğiyle iletişime geçin.",
    crypto_unavailable: "Güvenli bağlantı yapılandırması kullanılamıyor. Platform desteğiyle iletişime geçin.",
    membership_denied: "Bu bağlantıyı değiştirme yetkiniz bulunmuyor.",
    durable_authority_invalid: "Oturumunuz sona erdi. Yeniden giriş yapın.",
    store_inactive: "Bu mağazanın bağlantıları şu anda değiştirilemiyor.",
    oauth_denied: "Google erişimine izin verilmedi. Yeniden bağlanabilirsiniz.",
    oauth_state_invalid: "Google bağlantı isteği sona erdi. Yeniden bağlanın.",
    needs_reconnect: "Google erişimi sona erdi. Seçiminiz korundu; yeniden bağlanın.",
    incremental_authorization_required: "Kurulumu uygulamak için Google’da ek yetki gerekiyor. Seçiminiz korundu.",
    ads_project_unapproved: "Google Ads API erişimi platform için henüz onaylanmadı. Platform desteğiyle iletişime geçin.",
    provider_denied: "Google bu işleme izin vermedi. Hesap erişiminizi kontrol edin.",
    resource_denied: "Seçilen kaynağa erişilemiyor. Listeyi yenileyip erişebildiğiniz bir kaynak seçin.",
    wrong_domain: "Seçilen site bu mağazanın alan adıyla eşleşmiyor.",
    unsafe_container: "Bu konteynerin etiketleri güvenli standart kuruluma uygun değil. Mağaza için yeni bir konteyner oluşturun.",
    live_version_conflict: "Google Tag Manager konteyneri değişti. Mevcut etiketleri korumak için güncel bağlantıyı yükleyin.",
    version_conflict: "Bağlantı başka bir işlemde değiştirildi. Güncel bağlantıyı yükleyin.",
    verification_pending: "Google site doğrulamasını henüz tamamlayamadı. Seçiminiz korundu; tekrar uygulayın.",
    provider_limit: "Google geçici bir istek sınırı uyguladı. Seçiminiz korundu; biraz sonra tekrar deneyin.",
    operation_busy: "Bu işlem hâlâ tamamlanıyor. Seçiminiz korundu; tekrar deneyin.",
    operation_mismatch: "İşlem kaydı bu seçimle eşleşmiyor. Güncel bağlantıyı yükleyin.",
    invalid_input: "Hesap ve kaynak seçiminizi kontrol edin.",
  };
  return messages[code] ?? "İşlemin sonucu doğrulanamadı. Seçiminiz korundu; aynı işlemi tekrar deneyin.";
}
export type Attempt<T> = Readonly<{ operationId: string; input: T }>;
export type Draft = Readonly<{ selection: GoogleMarketingSelection | null; apply?: Attempt<ApplyInput>; disconnect?: Attempt<DisconnectInput> }>;
export function createSelection(service: GoogleMarketingService, accountId: string, storeDomain: string): GoogleMarketingSelection | null {
  if (!storeDomain || service === "ads" || (service === "gtm" && !accountId)) return null;
  return { accountId: service === "search_console" ? "site" : accountId, resourceId: service === "search_console" ? `https://${storeDomain}/` : storeDomain, resourceName: storeDomain, create: true };
}
export function draftKey(domain: string, email: string | null, service: GoogleMarketingService): string { return `celebix-google:${domain}:${email ?? "unconnected"}:${service}`; }
export function readDraft(key: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw || raw.length > 8000) return null;
    const value = JSON.parse(raw);
    const selection = value.selection === null ? null : parseGoogleMarketingSelection(value.selection);
    const parseAttempt = (v: any, selectionRequired: boolean) => {
      if (!v || typeof v.operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(v.operationId) || !v.input || !Number.isSafeInteger(v.input.expectedVersion) || v.input.expectedVersion < 0 || !SERVICES.some(item => item.service === v.input.service)) return undefined;
      return { operationId: v.operationId, input: { service: v.input.service, expectedVersion: v.input.expectedVersion, ...(selectionRequired ? { selection: parseGoogleMarketingSelection(v.input.selection) } : {}) } };
    };
    return { selection, ...(value.apply ? { apply: parseAttempt(value.apply, true) as Attempt<ApplyInput> } : {}), ...(value.disconnect ? { disconnect: parseAttempt(value.disconnect, false) as Attempt<DisconnectInput> } : {}) };
  } catch { return null; }
}
export function storeDraft(key: string, draft: Draft | null): void { try { if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft)); else window.sessionStorage.removeItem(key); } catch { /* An unavailable browser store must not block the current modal. */ } }
