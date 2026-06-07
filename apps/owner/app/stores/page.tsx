import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import {
  OwnerActionButton,
  OwnerDataList,
  OwnerEmptyState,
  OwnerKpiCard,
  OwnerPageHeader,
  OwnerSectionCard,
  OwnerStatusChip,
  type OwnerTone,
} from "@/components/owner-control";
import type { DashboardStoreSummary } from "@/lib/control-plane";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import {
  getDatabaseModeLabel,
  getProvisioningLabel,
  getSetupSignals,
  hasPendingSetupSignals,
  isLegacyDatabaseMode,
} from "@/lib/lifecycle-ui";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { listDashboardStores } from "@/lib/control-plane";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";
import {
  getPreviewDashboardStores,
  getPreviewOwnerAuthContext,
  hasOwnerPreviewDataFallback,
} from "@/lib/owner-preview-fixtures";

function getStoreStatusLabel(status: DashboardStoreSummary["status"]) {
  if (status === "active") {
    return "Aktif";
  }

  if (status === "paused") {
    return "Duraklatıldı";
  }

  return "Taslak";
}

function getStoreStatusTone(status: DashboardStoreSummary["status"]): OwnerTone {
  if (status === "active") {
    return "success";
  }

  if (status === "paused") {
    return "warning";
  }

  return "neutral";
}

function getLifecycleStageLabel(stage: DashboardStoreSummary["management"]["lifecycleStage"]) {
  switch (stage) {
    case "growth":
      return "Büyüme";
    case "live":
      return "Canlı";
    case "launch_ready":
      return "Yayına Hazır";
    case "building":
      return "Kurulumda";
    case "onboarding":
    default:
      return "Hazırlanıyor";
  }
}

function getLifecycleTone(stage: DashboardStoreSummary["management"]["lifecycleStage"]): OwnerTone {
  switch (stage) {
    case "growth":
      return "accent";
    case "live":
    case "launch_ready":
      return "success";
    case "building":
      return "warning";
    case "onboarding":
    default:
      return "neutral";
  }
}

function getPortfolioHealthTone(label: DashboardStoreSummary["health"]["label"]): OwnerTone {
  switch (label) {
    case "hazir":
      return "success";
    case "kritik":
      return "danger";
    case "operasyonel":
      return "accent";
    case "kurulum":
    default:
      return "warning";
  }
}

function getPortfolioHealthLabel(label: DashboardStoreSummary["health"]["label"]) {
  switch (label) {
    case "hazir":
      return "Hazır";
    case "kritik":
      return "Kritik";
    case "operasyonel":
      return "Operasyonel";
    case "kurulum":
    default:
      return "Kurulum";
  }
}

function getAdminHealth(store: DashboardStoreSummary) {
  if (store.health.adminDeploymentReady && store.health.adminRuntimeConsistent) {
    return { label: "Admin hazır", tone: "success" as const };
  }

  if (store.health.adminDeploymentReady) {
    return { label: "Admin drift", tone: "warning" as const };
  }

  return { label: "Admin kapalı", tone: "danger" as const };
}

function getStorefrontHealth(store: DashboardStoreSummary) {
  if (store.health.storefrontReady && store.health.storefrontRuntimeConsistent) {
    return { label: "Storefront hazır", tone: "success" as const };
  }

  if (store.storefrontStatus === "active" || store.health.storefrontReady) {
    return { label: "Storefront izleniyor", tone: "warning" as const };
  }

  return { label: "Storefront bekliyor", tone: "neutral" as const };
}

function getProvisioningTone(state: DashboardStoreSummary["provisioning"]["state"]): OwnerTone {
  switch (state) {
    case "failed":
      return "danger";
    case "pending_repair":
    case "pending_dns":
    case "pending_auth":
    case "pending_analytics":
    case "pending_payment":
    case "pending_smoke":
      return "warning";
    case "ready":
    case "database_ready":
    case "storage_ready":
    case "auth_ready":
    case "analytics_ready":
    case "admin_ready":
    case "storefront_ready":
    case "smoke_ready":
      return "success";
    case "running":
    case "provisioning":
      return "accent";
    default:
      return "neutral";
  }
}

function getSignalTone(signal: ReturnType<typeof getSetupSignals>[number]): OwnerTone {
  if (signal.pending) {
    return "warning";
  }

  if (signal.key === "auth" && signal.providerLabel === "supabase") {
    return "legacy";
  }

  return "success";
}

function getReadinessNote(store: DashboardStoreSummary, pendingSignalCount: number) {
  if (store.provisioning.failedStepCount > 0) {
    return `${store.provisioning.failedStepCount} adım hata verdi, manuel takip gerekiyor.`;
  }

  if (store.provisioning.state === "pending_repair") {
    return "Onarım kuyruğunda, otomatik akış dışında tutuluyor.";
  }

  if (pendingSignalCount > 0) {
    return `${pendingSignalCount} kurulum işi tamamlanmadan yayına hazır sayılmaz.`;
  }

  if (store.consistency.blocking) {
    return `${store.consistency.blockingIssueCount} tutarlılık blokajı bulunuyor.`;
  }

  return "Kurulum zinciri temiz, sadece günlük operasyon takibi gerekiyor.";
}

export default async function StoresPage() {
  const previewFallback = hasOwnerPreviewDataFallback();
  const auth = previewFallback ? getPreviewOwnerAuthContext() : await requireOwnerAuth("/stores");
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const createStoreDisabled = isOwnerActionDisabled("create_store", previewFlags);
  const deployDisabled = isOwnerActionDisabled("deploy", previewFlags);
  const deployDisabledReason = getOwnerPreviewDisabledNotice("deploy", previewFlags) ?? undefined;
  const stores = previewFallback ? getPreviewDashboardStores() : await listDashboardStores(auth);

  const readyCount = stores.filter((store) => store.provisioning.state === "ready").length;
  const newStandardCount = stores.filter((store) => !isLegacyDatabaseMode(store.databaseMode)).length;
  const legacyCount = stores.length - newStandardCount;
  const actionRequiredCount = stores.filter(
    (store) =>
      hasPendingSetupSignals(store.setup) ||
      store.provisioning.state === "pending_repair" ||
      store.provisioning.state === "failed" ||
      store.consistency.blocking,
  ).length;
  const dualHealthReadyCount = stores.filter(
    (store) => store.health.adminRuntimeConsistent && store.health.storefrontRuntimeConsistent,
  ).length;

  return (
    <>
      <OwnerPageHeader
        eyebrow="Portföy"
        title="Mağazalar"
        copy="Mağaza portföyünü Yeni Standart, kurulum kuyruğu ve panel sağlığı üzerinden tek bakışta yönetin. Yoğun tablo yerine, karar aldıran satır-kart yapısı kullanılır."
        chips={
          <>
            <OwnerStatusChip tone="accent">{newStandardCount} Yeni Standart</OwnerStatusChip>
            <OwnerStatusChip tone={legacyCount > 0 ? "legacy" : "success"}>
              {legacyCount > 0 ? `${legacyCount} Legacy` : "Legacy yok"}
            </OwnerStatusChip>
            <OwnerStatusChip tone={actionRequiredCount > 0 ? "warning" : "success"}>
              {actionRequiredCount > 0 ? `${actionRequiredCount} mağaza aksiyon bekliyor` : "Aksiyon kuyruğu temiz"}
            </OwnerStatusChip>
          </>
        }
        actions={
          <>
            <OwnerActionButton href="/operations" tone="secondary">
              Operasyon Merkezi
            </OwnerActionButton>
            {superAdmin ? (
              <OwnerActionButton href="/stores/new" tone="primary" disabled={createStoreDisabled}>
                {createStoreDisabled ? "Yeni Mağaza Formu" : "Yeni Mağaza"}
              </OwnerActionButton>
            ) : null}
          </>
        }
        aside={
          <div className="owner-header-summary">
            <div className="owner-header-summary-item">
              <span>Toplam mağaza</span>
              <strong>{stores.length}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Kurulum hazır</span>
              <strong>{readyCount}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Çift sağlık hazır</span>
              <strong>{dualHealthReadyCount}</strong>
            </div>
            <div className="owner-header-summary-item">
              <span>Detay takibi gereken</span>
              <strong>{actionRequiredCount}</strong>
            </div>
          </div>
        }
      />

      <div className="owner-metric-grid">
        <OwnerKpiCard
          label="Yayına yakın"
          value={readyCount}
          note="Kurulum zinciri bitmiş mağazalar"
          tone="success"
        />
        <OwnerKpiCard
          label="Yeni Standart"
          value={newStandardCount}
          note="Light Postgres ile ilerleyen portföy"
          tone="accent"
        />
        <OwnerKpiCard
          label="Kurulum aksiyonu"
          value={actionRequiredCount}
          note="Auth, analytics, ödeme veya onarım kuyruğu"
          tone={actionRequiredCount > 0 ? "warning" : "success"}
        />
        <OwnerKpiCard
          label="Legacy istisna"
          value={legacyCount}
          note="Eski modda tutulan mağazalar"
          tone={legacyCount > 0 ? "legacy" : "neutral"}
        />
      </div>

      <OwnerSectionCard
        eyebrow="Portföy Listesi"
        title="Mağaza satırları"
        copy="Her satır; mağaza kimliği, sağlık görünümü, bekleyen kurulum işleri ve hızlı detay erişimini aynı yüzeyde taşır."
        actions={
          <>
            <OwnerStatusChip tone="ink">{stores.length} kayıt</OwnerStatusChip>
            <OwnerStatusChip tone={dualHealthReadyCount === stores.length && stores.length > 0 ? "success" : "accent"}>
              {dualHealthReadyCount} mağazada admin ve storefront birlikte hazır
            </OwnerStatusChip>
          </>
        }
      >
        {stores.length === 0 ? (
          <OwnerEmptyState
            title="Henüz mağaza yok"
            copy="İlk mağazayı oluşturduğunuzda portföy satırları burada oluşacak."
            action={
              superAdmin ? (
                <OwnerActionButton href="/stores/new" tone="primary" disabled={createStoreDisabled}>
                  {createStoreDisabled ? "Yeni Mağaza Formu" : "Yeni Mağaza"}
                </OwnerActionButton>
              ) : null
            }
          />
        ) : (
          <OwnerDataList className="store-portfolio-list">
            {stores.map((store) => {
              const setupSignals = getSetupSignals(store.setup);
              const pendingSignals = setupSignals.filter((signal) => signal.pending);
              const adminHealth = getAdminHealth(store);
              const storefrontHealth = getStorefrontHealth(store);
              const lifecycleLabel = getLifecycleStageLabel(store.management.lifecycleStage);
              const readinessNote = getReadinessNote(store, pendingSignals.length);

              return (
                <article key={store.id} className="store-portfolio-card">
                  <div className="store-portfolio-header">
                    <div className="store-portfolio-title">
                      <div className="store-portfolio-name">
                        <strong>{store.name}</strong>
                        <span>{store.storefrontDomain}</span>
                      </div>
                      <div className="store-portfolio-chip-row">
                        <OwnerStatusChip tone={isLegacyDatabaseMode(store.databaseMode) ? "legacy" : "ink"}>
                          {getDatabaseModeLabel(store.databaseMode)}
                        </OwnerStatusChip>
                        <OwnerStatusChip tone={getLifecycleTone(store.management.lifecycleStage)}>
                          {lifecycleLabel}
                        </OwnerStatusChip>
                        <OwnerStatusChip tone={getStoreStatusTone(store.status)}>
                          {getStoreStatusLabel(store.status)}
                        </OwnerStatusChip>
                        <OwnerStatusChip tone={getPortfolioHealthTone(store.health.label)}>
                          {getPortfolioHealthLabel(store.health.label)}
                        </OwnerStatusChip>
                      </div>
                    </div>

                    <div className="store-portfolio-activity">
                      <span>Son aktivite</span>
                      <strong>{formatDateTime(store.lastSyncedAt)}</strong>
                    </div>
                  </div>

                  <div className="store-portfolio-body">
                    <div className="store-portfolio-stack">
                      <div className="owner-mini-stat">
                        <span>Portföy sahibi</span>
                        <strong>{store.management.clientCompanyName || store.name}</strong>
                        <small>{store.management.internalOwner || "İç sahip henüz atanmadı"}</small>
                      </div>
                      <div className="owner-mini-stat">
                        <span>Hacim</span>
                        <strong>{formatCurrency(store.totalRevenue)}</strong>
                        <small>
                          {store.orderCount} sipariş · {store.pendingOrderCount} bekleyen işlem
                        </small>
                      </div>
                    </div>

                    <div className="store-portfolio-stack">
                      <div className="owner-mini-stat">
                        <span>Kurulum akışı</span>
                        <strong>{getProvisioningLabel(store.provisioning.state)}</strong>
                        <small>{readinessNote}</small>
                      </div>
                      <div className="store-health-chip-row">
                        {setupSignals.map((signal) => (
                          <OwnerStatusChip key={signal.key} tone={getSignalTone(signal)}>
                            {signal.pending ? signal.shortLabel : `${signal.title} hazır`}
                          </OwnerStatusChip>
                        ))}
                      </div>
                    </div>

                    <div className="store-portfolio-stack">
                      <div className="owner-mini-stat">
                        <span>Sağlık görünümü</span>
                        <strong>{store.health.adminRuntimeConsistent && store.health.storefrontRuntimeConsistent ? "Çift taraf hazır" : "Takip gerekiyor"}</strong>
                        <small>
                          {store.consistency.blocking
                            ? `${store.consistency.blockingIssueCount} tutarlılık blokajı var`
                            : "Tutarlılık tarafında blokaj görünmüyor"}
                        </small>
                      </div>
                      <div className="store-health-chip-row">
                        <OwnerStatusChip tone={adminHealth.tone}>{adminHealth.label}</OwnerStatusChip>
                        <OwnerStatusChip tone={storefrontHealth.tone}>{storefrontHealth.label}</OwnerStatusChip>
                        <OwnerStatusChip tone={getProvisioningTone(store.provisioning.state)}>
                          {store.provisioning.failedStepCount > 0
                            ? `${store.provisioning.failedStepCount} hata`
                            : store.provisioning.pendingStepCount > 0
                              ? `${store.provisioning.pendingStepCount} bekleyen adım`
                              : "Adım kuyruğu temiz"}
                        </OwnerStatusChip>
                      </div>
                    </div>

                    <div className="store-portfolio-actions">
                      <OwnerActionButton href={`/stores/${store.slug}`} tone="secondary">
                        Detayı Aç
                      </OwnerActionButton>
                      {superAdmin ? (
                        <LaunchStorefrontButton
                          slug={store.slug}
                          currentStatus={store.storefrontStatus}
                          disabled={deployDisabled}
                          disabledReason={deployDisabledReason}
                        />
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </OwnerDataList>
        )}
      </OwnerSectionCard>
    </>
  );
}
