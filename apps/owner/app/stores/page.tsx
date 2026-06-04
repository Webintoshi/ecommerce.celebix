import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import {
  OwnerCommandHero,
  OwnerDataTableShell,
  OwnerEmptyState,
  OwnerMetricCard,
  OwnerStatusChip,
} from "@/components/owner-control";
import { formatCurrency, formatDate, formatDateTime, formatPercent } from "@/lib/formatters";
import {
  getDatabaseModeLabel,
  getDatabaseModePillClass,
  getProvisioningLabel,
  getProvisioningToneClass,
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

function getHealthToneClass(label: string) {
  if (label === "hazir") {
    return "pill-success";
  }

  if (label === "kritik") {
    return "pill-danger";
  }

  return "pill-warning";
}

export default async function StoresPage() {
  const auth = await requireOwnerAuth("/stores");
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const createStoreDisabled = isOwnerActionDisabled("create_store", previewFlags);
  const deployDisabled = isOwnerActionDisabled("deploy", previewFlags);
  const deployDisabledReason = getOwnerPreviewDisabledNotice("deploy", previewFlags) ?? undefined;
  const stores = await listDashboardStores(auth);

  const readyCount = stores.filter((store) => store.provisioning.state === "ready").length;
  const pendingSignalCount = stores.filter((store) => hasPendingSetupSignals(store.setup)).length;
  const legacyCount = stores.filter((store) => isLegacyDatabaseMode(store.databaseMode)).length;
  const repairCount = stores.filter(
    (store) => store.provisioning.state === "pending_repair" || store.provisioning.state === "failed",
  ).length;

  return (
    <>
      <OwnerCommandHero
        overline="Stores Layer"
        title="Projeler"
        copy="Magaza portfoyu artik liste degil; database standardi, lifecycle ritmi ve setup aksiyonlariyla okunan operasyon haritasi."
        metrics={[
          { label: "Toplam proje", value: stores.length, note: `${readyCount} proje canliya yakin akista` },
          { label: "Kurulum aksiyonu", value: pendingSignalCount, note: "Auth, analytics ve payment sinyalleri" },
          { label: "Yeni standart disi", value: legacyCount, note: "Legacy full_supabase istisnalari" },
        ]}
        actions={
          <>
            {superAdmin ? (
              <Link
                className={`button ${createStoreDisabled ? "button-secondary" : "button-primary"}`}
                href="/stores/new"
              >
                {createStoreDisabled ? "Yeni proje formu" : "+ Yeni proje"}
              </Link>
            ) : null}
            <OwnerStatusChip tone="accent">{readyCount} lifecycle hazir</OwnerStatusChip>
            <OwnerStatusChip tone={repairCount > 0 ? "danger" : "success"}>
              {repairCount > 0 ? `${repairCount} onarim aksiyonu` : "Repair kuyrugu temiz"}
            </OwnerStatusChip>
          </>
        }
        panelTitle="Store standardizasyon notlari"
        panelItems={[
          { label: "Varsayilan profil", value: "light_postgres" },
          { label: "Legacy ayrimi", value: `${legacyCount} store` },
          { label: "Setup sinyali", value: `${pendingSignalCount} proje` },
          { label: "Onarim gerektiren", value: repairCount },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">Brand locked lifecycle</span>
            <span className="hero-chip hero-chip-neutral">Legacy ve yeni standart ayni dilde ayrisir</span>
          </>
        }
      />

      <div className="owner-metric-grid">
        <OwnerMetricCard label="Hazir lifecycle" value={readyCount} note="Ready state projeler" tone="success" />
        <OwnerMetricCard label="Setup queue" value={pendingSignalCount} note="Non-blocking aksiyonlar" tone={pendingSignalCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Legacy mode" value={legacyCount} note="Full Supabase istisnasi" tone={legacyCount > 0 ? "legacy" : "neutral"} />
        <OwnerMetricCard label="Repair queue" value={repairCount} note="Onarim bekleyenler" tone={repairCount > 0 ? "danger" : "success"} />
      </div>

      <OwnerDataTableShell
        title="Magaza operasyon listesi"
        copy="Her proje satiri artik teknik kolonlar yerine kimlik, standart, lifecycle ve hizli aksiyon bilgisiyle okunur."
      >
        {stores.length === 0 ? (
          <OwnerEmptyState title="Henuz proje yok" copy="Ilk projeyi olusturmak icin Yeni proje akisini kullanin." />
        ) : (
          <div className="owner-store-list">
            {stores.map((store) => {
              const setupSignals = getSetupSignals(store.setup);
              const pendingSignals = setupSignals.filter((signal) => signal.pending);
              const healthToneClass = getHealthToneClass(store.health.label);
              const provisioningToneClass = getProvisioningToneClass(store.provisioning.state);
              const provisioningLabel = getProvisioningLabel(store.provisioning.state);
              const databaseModeLabel = getDatabaseModeLabel(store.databaseMode);
              const databaseModePillClass = getDatabaseModePillClass(store.databaseMode);
              const legacyMode = isLegacyDatabaseMode(store.databaseMode);

              return (
                <article key={store.id} className="owner-store-row">
                  <div className="owner-store-identity">
                    <strong>{store.name}</strong>
                    <span className="owner-store-domain">{store.storefrontDomain}</span>
                    <div className="table-pill-row">
                      <span className={databaseModePillClass}>{databaseModeLabel}</span>
                      {legacyMode ? <span className="pill pill-legacy">legacy mode</span> : null}
                      <span className="pill pill-capitalize">{store.status}</span>
                    </div>
                  </div>
                  <div className="owner-store-meta">
                    <strong>{store.management.clientCompanyName || store.name}</strong>
                    <span>{store.management.internalOwner || "Atanmadi"}</span>
                    <span>{legacyMode ? "Legacy istisna akisi" : "Yeni Celebix Standardi"}</span>
                    <span>{formatCurrency(store.totalRevenue)} / {store.orderCount} siparis</span>
                  </div>
                  <div className="owner-store-health">
                    <div className="table-pill-row">
                      <span className={`pill ${healthToneClass}`}>{store.health.label}</span>
                      <span className={`pill ${provisioningToneClass}`}>{provisioningLabel}</span>
                      {pendingSignals.map((signal) => (
                        <span key={signal.key} className={signal.pillClassName}>
                          {signal.shortLabel}
                        </span>
                      ))}
                    </div>
                    <div className="table-inline-meta">
                      Admin {store.health.adminRuntimeConsistent ? "hazir" : "runtime drift"} / R2{" "}
                      {store.health.r2Ready ? "hazir" : "eksik"} / Secret{" "}
                      {store.health.secretAuthorityReady ? "hazir" : "drift"}
                    </div>
                    <div className="table-inline-meta">
                      {pendingSignals.length > 0 ? `${pendingSignals.length} setup aksiyonu bekliyor` : "Setup sinyali temiz"} / Son sync {formatDateTime(store.lastSyncedAt)}
                    </div>
                  </div>
                  <div className="owner-store-actions">
                    <Link className="button button-secondary" href={`/stores/${store.slug}`}>
                      Detay
                    </Link>
                    {superAdmin ? (
                      <LaunchStorefrontButton
                        slug={store.slug}
                        currentStatus={store.storefrontStatus}
                        disabled={deployDisabled}
                        disabledReason={deployDisabledReason}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </OwnerDataTableShell>
    </>
  );
}
