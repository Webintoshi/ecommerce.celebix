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

function getStoreStatusLabel(status: string) {
  if (status === "active") {
    return "Aktif";
  }
  if (status === "paused") {
    return "Duraklatıldı";
  }
  return "Taslak";
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
        overline="Mağazalar"
        title="Mağazalar"
        copy="Mağaza portföyü; standart, kurulum akışı, sağlık ve bekleyen aksiyonlarıyla okunur."
        metrics={[
          { label: "Toplam mağaza", value: stores.length, note: `${readyCount} mağaza yayına yakın` },
          { label: "Kurulum aksiyonu", value: pendingSignalCount, note: "Auth, analytics ve ödeme sinyalleri" },
          { label: "Yeni standart dışı", value: legacyCount, note: "Legacy istisnaları" },
        ]}
        actions={
          <>
            {superAdmin ? (
              <Link
                className={`button ${createStoreDisabled ? "button-secondary" : "button-primary"}`}
                href="/stores/new"
              >
                {createStoreDisabled ? "Yeni Mağaza formu" : "+ Yeni Mağaza"}
              </Link>
            ) : null}
            <OwnerStatusChip tone="accent">{readyCount} kurulum hazır</OwnerStatusChip>
            <OwnerStatusChip tone={repairCount > 0 ? "danger" : "success"}>
              {repairCount > 0 ? `${repairCount} onarım aksiyonu` : "Onarım kuyruğu temiz"}
            </OwnerStatusChip>
          </>
        }
        panelTitle="Mağaza standardı"
        panelItems={[
          { label: "Varsayılan profil", value: "Yeni Standart" },
          { label: "Legacy ayrımı", value: `${legacyCount} mağaza` },
          { label: "Kurulum sinyali", value: `${pendingSignalCount} mağaza` },
          { label: "Onarım gerektiren", value: repairCount },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">Kurulum Akışı</span>
            <span className="hero-chip hero-chip-neutral">Legacy ve Yeni Standart net ayrılır</span>
          </>
        }
      />

      <div className="owner-metric-grid">
        <OwnerMetricCard label="Kurulum hazır" value={readyCount} note="Hazır durumdaki mağazalar" tone="success" />
        <OwnerMetricCard label="Kurulum isteği" value={pendingSignalCount} note="Bekleyen aksiyonlar" tone={pendingSignalCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Legacy" value={legacyCount} note="Özel mod istisnası" tone={legacyCount > 0 ? "legacy" : "neutral"} />
        <OwnerMetricCard label="Onarım bekleyen" value={repairCount} note="Onarım kuyruğu" tone={repairCount > 0 ? "danger" : "success"} />
      </div>

      <OwnerDataTableShell
        title="Mağaza operasyon listesi"
        copy="Her mağaza; kimlik, standart, Kurulum Akışı ve hızlı aksiyon bilgisiyle okunur."
      >
        {stores.length === 0 ? (
          <OwnerEmptyState title="Henüz mağaza yok" copy="İlk mağazayı oluşturmak için Yeni Mağaza akışını kullanın." />
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
                      {legacyMode ? <span className="pill pill-legacy">Legacy özel mod</span> : null}
                      <span className="pill">{getStoreStatusLabel(store.status)}</span>
                    </div>
                  </div>
                  <div className="owner-store-meta">
                    <strong>{store.management.clientCompanyName || store.name}</strong>
                    <span>{store.management.internalOwner || "Atanmadi"}</span>
                    <span>{legacyMode ? "Legacy özel mod" : "Yeni Standart"}</span>
                    <span>{formatCurrency(store.totalRevenue)} / {store.orderCount} sipariş</span>
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
                      Admin {store.health.adminRuntimeConsistent ? "hazır" : "runtime drift"} / R2{" "}
                      {store.health.r2Ready ? "hazır" : "eksik"} / Secret{" "}
                      {store.health.secretAuthorityReady ? "hazır" : "drift"}
                    </div>
                    <div className="table-inline-meta">
                      {pendingSignals.length > 0 ? `${pendingSignals.length} kurulum aksiyonu bekliyor` : "Kurulum sinyali temiz"} / Son eşitleme {formatDateTime(store.lastSyncedAt)}
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
