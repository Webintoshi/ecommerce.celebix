import type { StoreDomainView } from "@celebix/saas-contracts";

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
