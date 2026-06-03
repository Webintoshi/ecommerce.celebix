import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
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
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="hero-stack">
            <span className="hero-overline">Stores Layer</span>
            <div>
              <h1>Projeler</h1>
              <p>
                Her magazanin kurulum dili, yeni standart profili ve operasyon sinyalleri bu
                panelde tek Celebix palette ile okunur.
              </p>
            </div>
          </div>

          <div className="hero-quick-metrics">
            <div className="hero-kpi">
              <span>Toplam proje</span>
              <strong>{stores.length}</strong>
              <small>{readyCount} proje canliya yakin akista</small>
            </div>
            <div className="hero-kpi">
              <span>Kurulum aksiyonu bekleyenler</span>
              <strong>{pendingSignalCount}</strong>
              <small>Auth, analytics ve payment placeholder sinyalleri</small>
            </div>
            <div className="hero-kpi">
              <span>Yeni standart disi magazalar</span>
              <strong>{legacyCount}</strong>
              <small>Legacy full_supabase profiline ayrilan istisnalar</small>
            </div>
          </div>

          <div className="actions hero-actions">
            {superAdmin ? (
              <Link
                className={`button ${createStoreDisabled ? "button-secondary" : "button-primary"}`}
                href="/stores/new"
              >
                {createStoreDisabled ? "Yeni proje formu" : "+ Yeni proje"}
              </Link>
            ) : null}
            <span className="pill pill-accent">{readyCount} lifecycle hazir</span>
            <span className={`pill ${repairCount > 0 ? "pill-danger" : "pill-success"}`}>
              {repairCount > 0 ? `${repairCount} onarim aksiyonu` : "Repair kuyrugu temiz"}
            </span>
          </div>
        </div>

        <aside className="dashboard-hero-panel">
          <div className="card-title">Store standardizasyon notlari</div>
          <div className="hero-list">
            <div className="hero-list-item">
              <span>Varsayilan profil</span>
              <strong>light_postgres</strong>
            </div>
            <div className="hero-list-item">
              <span>Legacy ayrimi</span>
              <strong>{legacyCount} store</strong>
            </div>
            <div className="hero-list-item">
              <span>Setup sinyali</span>
              <strong>{pendingSignalCount} proje</strong>
            </div>
            <div className="hero-list-item">
              <span>Onarim gerektiren</span>
              <strong>{repairCount}</strong>
            </div>
          </div>
          <div className="hero-chip-row">
            <span className="hero-chip hero-chip-accent">Brand locked lifecycle</span>
            <span className="hero-chip hero-chip-neutral">Legacy ve yeni standart ayni dilde ayrisir</span>
          </div>
        </aside>
      </section>

      <div className="card">
        {stores.length === 0 ? (
          <div className="empty-state">
            <h3>Henuz proje yok</h3>
            <p>Ilk projeyi olusturmak icin "Yeni proje" butonuna tiklayin.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proje</th>
                  <th>Client</th>
                  <th>Paket</th>
                  <th>Kurulum / Saglik</th>
                  <th>Admin</th>
                  <th>Ciro</th>
                  <th>Son sync</th>
                  <th className="table-cell-right">Islem</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={store.id}>
                      <td>
                        <strong>{store.name}</strong>
                        <div className="table-inline-meta">{store.storefrontDomain}</div>
                        <div className="table-pill-row">
                          <span className={databaseModePillClass}>{databaseModeLabel}</span>
                          {legacyMode ? <span className="pill pill-legacy">legacy mode</span> : null}
                          <span className="pill pill-capitalize">{store.status}</span>
                        </div>
                      </td>
                      <td>
                        <strong>{store.management.clientCompanyName || store.name}</strong>
                        <div className="table-inline-meta">{store.management.internalOwner || "Atanmadi"}</div>
                        <div className="table-inline-meta">
                          {legacyMode
                            ? "Legacy istisna akisi owner tarafinda ayrik izlenir."
                            : "Yeni standart light_postgres owner authority ile izlenir."}
                        </div>
                      </td>
                      <td>
                        <div className="table-stack">
                          <div className="table-pill-row">
                            <span
                              className={`pill ${
                                store.management.subscription.status === "active"
                                  ? "pill-success"
                                  : "pill-warning"
                              }`}
                            >
                              {store.management.subscription.cadenceLabel}
                            </span>
                            <span className="pill pill-ink">
                              {store.management.subscription.countdownLabel}
                            </span>
                          </div>
                          <div className="table-inline-meta">
                            Bitis: {formatDate(store.management.subscription.endDate)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="table-stack">
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
                            Veri: {store.health.supabaseReady ? "hazir" : "bekliyor"} / R2:{" "}
                            {store.health.r2Ready ? "hazir" : "eksik"} / Runtime:{" "}
                            {store.health.adminRuntimeConsistent ? "hazir" : "sorunlu"}
                          </div>
                          <div className="table-inline-meta">
                            Secret authority: {store.health.secretAuthorityReady ? "hazir" : "drift"} /
                            Consistency:{" "}
                            {store.consistency.blocking
                              ? `${store.consistency.blockingIssueCount} blok`
                              : "temiz"}
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{store.storeAdminCount}</strong>
                        <div className="table-inline-meta">Affiliate: %{formatPercent(store.totalAffiliateRate)}</div>
                        <div className="table-inline-meta">
                          {pendingSignals.length > 0
                            ? `${pendingSignals.length} operasyon sinyali bekliyor`
                            : "Setup sinyali temiz"}
                        </div>
                      </td>
                      <td className="table-strong">{formatCurrency(store.totalRevenue)}</td>
                      <td>{formatDateTime(store.lastSyncedAt)}</td>
                      <td className="table-cell-right">
                        <div className="actions no-margin actions-end">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
