import type { StoreDomainReplacementView, StoreDomainView } from "@celebix/saas-contracts";

export type StoreDomainStatusTone = "neutral" | "pending" | "warning" | "success";

export function getStoreDomainStatusPresentation(domain: StoreDomainView): Readonly<{ label: string; tone: StoreDomainStatusTone }> {
  if (domain.hostnameType === "platform_subdomain" && domain.status === "active") return Object.freeze({ label: "Celebix adresi", tone: "success" });
  switch (domain.uiStatus) {
    case "dns_pending": return Object.freeze({ label: "DNS bekleniyor", tone: "pending" });
    case "hostname_pending": return Object.freeze({ label: "Alan adı ekleniyor", tone: "pending" });
    case "ssl_pending": return Object.freeze({ label: "SSL hazırlanıyor", tone: "pending" });
    case "origin_pending": return Object.freeze({ label: "Bağlantı doğrulanıyor", tone: "pending" });
    case "action_required": return Object.freeze({ label: "DNS ayarı gerekli", tone: "warning" });
    case "active": return Object.freeze({ label: "Yayında", tone: "success" });
    case "disabled": return Object.freeze({ label: "Kaldırıldı", tone: "neutral" });
  }
}

export function getStoreDomainProgress(domain: StoreDomainView): 1 | 2 | 3 | 4 {
  if (domain.uiStatus === "active") return 4;
  if (domain.uiStatus === "ssl_pending" || domain.uiStatus === "origin_pending") return 3;
  if (domain.uiStatus === "action_required") return 2;
  return 1;
}

export function getStoreDomainReplacementPresentation(replacement: StoreDomainReplacementView): Readonly<{
  label: string; tone: StoreDomainStatusTone; action: "activate" | "cancel" | "rollback" | null;
}> {
  if (replacement.status === "activated") return Object.freeze({ label: "Yeni adres birincil", tone: "success", action: "rollback" });
  if (replacement.status === "cancelled") return Object.freeze({ label: "Geçiş iptal edildi", tone: "neutral", action: null });
  if (replacement.status === "rolled_back") return Object.freeze({ label: "Eski adrese dönüldü", tone: "warning", action: null });
  return replacement.ready
    ? Object.freeze({ label: "Geçişe hazır", tone: "success", action: "activate" })
    : Object.freeze({ label: "Yeni adres hazırlanıyor", tone: "pending", action: "cancel" });
}
