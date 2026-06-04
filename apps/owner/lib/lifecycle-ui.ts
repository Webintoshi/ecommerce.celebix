import type { DatabaseMode } from "@celebix/platform-config";
import type { StoreSetupSummary } from "@/lib/control-plane";
import type { ProvisioningState } from "@/lib/store-lifecycle";

export interface SetupSignalDisplay {
  key: "auth" | "analytics" | "payment";
  title: string;
  shortLabel: string;
  providerLabel: string;
  statusLabel: string;
  pillClassName: string;
  cardToneClass: string;
  note: string;
  pending: boolean;
  configured: boolean;
}

const PROVISIONING_LABELS: Record<ProvisioningState, string> = {
  running: "işleniyor",
  provisioning: "kuruluyor",
  pending_dns: "dns bekliyor",
  pending_auth: "auth bekliyor",
  pending_analytics: "analytics bekliyor",
  pending_payment: "ödeme bekliyor",
  ready: "hazır",
  pending_repair: "onarım aksiyonu",
  failed: "kritik arıza",
};

export function getProvisioningToneClass(state: ProvisioningState): string {
  switch (state) {
    case "ready":
      return "provisioning-tone-ready";
    case "pending_dns":
      return "provisioning-tone-pending_dns";
    case "pending_auth":
      return "provisioning-tone-pending_auth";
    case "pending_analytics":
      return "provisioning-tone-pending_analytics";
    case "pending_payment":
      return "provisioning-tone-pending_payment";
    case "failed":
      return "provisioning-tone-failed";
    case "pending_repair":
      return "provisioning-tone-pending_repair";
    case "running":
    case "provisioning":
    default:
      return "provisioning-tone-provisioning";
  }
}

export function getProvisioningLabel(state: ProvisioningState): string {
  return PROVISIONING_LABELS[state];
}

export function isLegacyDatabaseMode(databaseMode: DatabaseMode): boolean {
  return databaseMode === "full_supabase";
}

export function getDatabaseModeLabel(databaseMode: DatabaseMode): string {
  return isLegacyDatabaseMode(databaseMode) ? "Legacy" : "Yeni Standart";
}

export function getDatabaseModePillClass(databaseMode: DatabaseMode): string {
  return isLegacyDatabaseMode(databaseMode) ? "pill pill-legacy" : "pill pill-ink";
}

export function getSetupSignals(setup: StoreSetupSummary): SetupSignalDisplay[] {
  const authPending = setup.auth.status === "pending_auth_setup";
  const authLegacy = setup.auth.provider === "supabase";
  const analyticsPending = setup.analytics.status === "pending_analytics_setup";
  const paymentPending = setup.payments.status === "pending_payment_setup";

  return [
    {
      key: "auth",
      title: "Auth",
      shortLabel: authPending ? "auth bekliyor" : authLegacy ? "legacy auth" : "auth hazır",
      providerLabel: setup.auth.provider,
      statusLabel: authPending ? "pending_auth_setup" : "configured",
      pillClassName: authPending
        ? "pill provisioning-tone-pending_auth"
        : authLegacy
          ? "pill pill-legacy"
          : "pill pill-success",
      cardToneClass: authPending ? "tone-auth" : authLegacy ? "tone-legacy" : "tone-ready",
      note: authPending
        ? "Logto-ready placeholder owner authority içinde kayıtlı."
        : authLegacy
          ? "Bu mağaza istisnai olarak legacy Supabase auth ile çalışıyor."
          : "Auth authority canlı ve owner tarafında hazır görünüyor.",
      pending: authPending,
      configured: !authPending,
    },
    {
      key: "analytics",
      title: "Analytics",
      shortLabel: analyticsPending ? "analytics bekliyor" : "analytics hazır",
      providerLabel: setup.analytics.provider,
      statusLabel: setup.analytics.status,
      pillClassName: analyticsPending
        ? "pill provisioning-tone-pending_analytics"
        : "pill pill-success",
      cardToneClass: analyticsPending ? "tone-analytics" : "tone-ready",
      note: analyticsPending
        ? "Umami-ready placeholder owner authority içinde kayıtlı."
        : "Analytics authority canlı ve lifecycle tarafında tamam görünüyor.",
      pending: analyticsPending,
      configured: !analyticsPending,
    },
    {
      key: "payment",
      title: "Payment",
      shortLabel: paymentPending ? "ödeme bekliyor" : "ödeme hazır",
      providerLabel: setup.payments.defaultProvider,
      statusLabel: setup.payments.status,
      pillClassName: paymentPending
        ? "pill provisioning-tone-pending_payment"
        : "pill pill-success",
      cardToneClass: paymentPending ? "tone-payment" : "tone-ready",
      note: paymentPending
        ? "Tahsilat authority sonraki operasyon adımında tamamlanacak."
        : "Ödeme authority owner panel tarafında hazır kabul ediliyor.",
      pending: paymentPending,
      configured: !paymentPending,
    },
  ];
}

export function hasPendingSetupSignals(setup: StoreSetupSummary): boolean {
  return getSetupSignals(setup).some((signal) => signal.pending);
}
