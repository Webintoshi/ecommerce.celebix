import { formatDateTime } from "@/lib/formatters";
import { RepairAllStoreDeploymentAuthoritiesButton } from "@/components/RepairAllStoreDeploymentAuthoritiesButton";
import { RepairOwnerDeploymentBranchButton } from "@/components/RepairOwnerDeploymentBranchButton";
import {
  OwnerActionPanel,
  OwnerCommandHero,
  OwnerDataTableShell,
  OwnerMetricCard,
  OwnerStatusChip,
} from "@/components/owner-control";
import {
  getDatabaseModeLabel,
  getDatabaseModePillClass,
  getProvisioningLabel,
  getProvisioningToneClass,
  getSetupSignals,
  isLegacyDatabaseMode,
} from "@/lib/lifecycle-ui";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { getOperationsSummary, listDashboardStores } from "@/lib/control-plane";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";

export default async function OperationsPage() {
  const auth = await requireOwnerAuth("/operations");
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const repairDisabled = isOwnerActionDisabled("repair", previewFlags);
  const repairDisabledReason = getOwnerPreviewDisabledNotice("repair", previewFlags) ?? undefined;
  const [summary, stores] = await Promise.all([getOperationsSummary(auth), listDashboardStores(auth)]);
  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const legacyStoreCount = stores.filter((store) => isLegacyDatabaseMode(store.databaseMode)).length;
  const pendingAuthCount = stores.filter(
    (store) => store.setup.auth.status === "pending_auth_setup",
  ).length;
  const pendingAnalyticsCount = stores.filter(
    (store) => store.setup.analytics.status === "pending_analytics_setup",
  ).length;
  const pendingPaymentCount = stores.filter(
    (store) => store.setup.payments.status === "pending_payment_setup",
  ).length;
  const setupQueueCount = stores.filter((store) =>
    getSetupSignals(store.setup).some((signal) => signal.pending),
  ).length;
  const repairQueueCount = stores.filter(
    (store) => store.provisioning.state === "pending_repair" || store.provisioning.state === "failed",
  ).length;
  const warningCount =
    setupQueueCount +
    legacyStoreCount +
    summary.totals.missingR2 +
    summary.totals.secretDrift +
    summary.totals.adminRuntimeIssues +
    summary.totals.consistencyBlockingStores +
    summary.totals.orphanedCleanupRuns +
    repairQueueCount;

  return (
    <>
      <OwnerCommandHero
        overline="Operasyonlar"
        title="Operasyonlar"
        copy="Yeni Standart, uygulama yetkileri, temizlik kayıtları ve Legacy istisnaları tek operasyon yüzeyinde izlenir."
        metrics={[
          { label: "Hazır mağaza", value: summary.totals.readyStores, note: "Yayına yakın operasyon paketi" },
          { label: "Kurulum aksiyonu", value: setupQueueCount, note: "Auth, analytics veya ödeme bekleyenler" },
          { label: "Temizlik kuyruğu", value: summary.totals.orphanedCleanupRuns, note: `${repairQueueCount} onarım / ${legacyStoreCount} Legacy` },
        ]}
        panelTitle="Operasyon sinyalleri"
        panelItems={[
          { label: "Tutarlılık blokajı", value: summary.totals.consistencyBlockingStores },
          { label: "Secret drift", value: summary.totals.secretDrift },
          { label: "Yeni Standart Dışı Mağazalar", value: legacyStoreCount },
          { label: "Onarım kuyruğu", value: repairQueueCount },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">
              {superAdmin ? "Onarım kontrolleri" : "İzleme modu"}
            </span>
            <span className={`hero-chip ${warningCount > 0 ? "hero-chip-neutral" : "hero-chip-accent"}`}>
              {warningCount > 0 ? "Dikkat isteyen akış var" : "Operasyon temiz"}
            </span>
          </>
        }
      />

      {superAdmin ? (
        <div className="admin-command-grid">
          <div className="admin-command-card">
            <div className="section-head">
              <div>
                <div className="card-title">Owner deployment yetkisi</div>
                <p className="section-copy">
                  Owner kaynağı yanlış branch üzerinden yayına çıkıyorsa ya da otomatik yayın kapandıysa
                  buradan kontrollü şekilde onarılır.
                </p>
              </div>
              <RepairOwnerDeploymentBranchButton
                disabled={repairDisabled}
                disabledReason={repairDisabledReason}
              />
            </div>
            <div className="hero-chip-row">
              <span className="hero-chip hero-chip-accent">Yayın yetkisi</span>
              <span className="hero-chip hero-chip-neutral">Owner hattı</span>
            </div>
          </div>

          <div className="admin-command-card">
            <div className="section-head">
              <div>
                <div className="card-title">Mağaza deployment yetkisi</div>
                <p className="section-copy">
                  Mevcut mağaza kaynakları doğru yayın hattına alınır ve otomatik yayın ayarı
                  standart hale getirilir.
                </p>
              </div>
              <RepairAllStoreDeploymentAuthoritiesButton
                disabled={repairDisabled}
                disabledReason={repairDisabledReason}
              />
            </div>
            <div className="hero-chip-row">
              <span className="hero-chip hero-chip-accent">Mağaza hattı</span>
              <span className="hero-chip hero-chip-neutral">Otomatik yayın standardı</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="owner-metric-grid">
        <OwnerMetricCard label="Hazır mağaza" value={summary.totals.readyStores} note="Hazır kurulum" tone="success" />
        <OwnerMetricCard label="Yeni standart dışı" value={legacyStoreCount} note="Legacy özel mod" tone={legacyStoreCount > 0 ? "legacy" : "neutral"} />
        <OwnerMetricCard label="Auth Kurulumu Bekleyen" value={pendingAuthCount} note="Auth kurulumu" tone={pendingAuthCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Analytics Kurulumu Bekleyen" value={pendingAnalyticsCount} note="Analytics kurulumu" tone={pendingAnalyticsCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Ödeme Kurulumu Bekleyen" value={pendingPaymentCount} note="Ödeme kurulumu" tone={pendingPaymentCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="R2 eksik" value={summary.totals.missingR2} note="Medya authority" tone={summary.totals.missingR2 > 0 ? "danger" : "success"} />
        <OwnerMetricCard label="Secret drift" value={summary.totals.secretDrift} note="Authority drift" tone={summary.totals.secretDrift > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Runtime sorunu" value={summary.totals.adminRuntimeIssues} note="Admin runtime" tone={summary.totals.adminRuntimeIssues > 0 ? "danger" : "success"} />
        <OwnerMetricCard label="Temizlik kaydı" value={summary.totals.orphanedCleanupRuns} note="Temizlik kuyruğu" tone={summary.totals.orphanedCleanupRuns > 0 ? "warning" : "success"} />
      </div>

      <OwnerActionPanel
        title="Önizleme Modu aksiyonları"
        copy="Önizleme Modu aktifken onarım, temizlik ve yayın aksiyonları kapalı kalır; operasyon ekranı durum bilgisini göstermeye devam eder."
        tone="accent"
        actions={
          <>
            <OwnerStatusChip tone={repairDisabled ? "warning" : "success"}>
              Onarım {repairDisabled ? "kapalı" : "aktif"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="ink">Temizlik kuyruğu {summary.totals.orphanedCleanupRuns}</OwnerStatusChip>
          </>
        }
      />

      <div className="split-grid">
        <OwnerDataTableShell
          title="Operasyon kuyruğu"
          copy="Mağaza satırları Kurulum Akışı, kurulum istekleri, standart ve runtime sinyalleriyle izlenir."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mağaza</th>
                  <th>Kurulum Akışı</th>
                  <th>Kurulum Aksiyonu</th>
                  <th>Standart</th>
                  <th>Secrets</th>
                  <th>Admin Runtime</th>
                  <th>Tutarlılık</th>
                  <th>Medya</th>
                  <th>Son Sync</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => {
                  const store = storeMap.get(row.id);
                  const setupSignals = store ? getSetupSignals(store.setup) : [];
                  const pendingSetupSignals = setupSignals.filter((signal) => signal.pending);

                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <div className="table-inline-meta">{row.storefrontDomain}</div>
                        <div className="table-inline-meta">{row.adminDomain}</div>
                      </td>
                      <td>
                        <div className="table-pill-row">
                          <span
                            className={`pill ${
                              row.health.label === "hazir"
                                ? "pill-success"
                                : row.health.label === "kritik"
                                  ? "pill-danger"
                                  : "pill-warning"
                            }`}
                          >
                            {row.health.label}
                          </span>
                          <span className={`pill ${getProvisioningToneClass(row.provisioning.state)}`}>
                            {getProvisioningLabel(row.provisioning.state)}
                          </span>
                          {row.provisioning.failedStepCount > 0 ? (
                            <span className="pill pill-danger">{row.provisioning.failedStepCount} fail</span>
                          ) : null}
                        </div>
                        <div className="table-inline-meta">
                          Bekleyen adım: {row.provisioning.pendingStepCount} / Vitrin: {row.storefrontStatus}
                        </div>
                      </td>
                      <td>
                        {setupSignals.length > 0 ? (
                          <>
                            <div className="table-pill-row">
                              {setupSignals.map((signal) => (
                                <span key={signal.key} className={signal.pillClassName}>
                                  {signal.shortLabel}
                                </span>
                              ))}
                            </div>
                            <div className="table-inline-meta">
                              {pendingSetupSignals.length > 0
                                ? `${pendingSetupSignals.length} bekleyen kurulum aksiyonu`
                                : "Kurulum kuyruğu temiz"}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Kurulum sinyali okunamadı</span>
                        )}
                      </td>
                      <td>
                        {store ? (
                          <>
                            <div className="table-pill-row">
                              <span className={getDatabaseModePillClass(store.databaseMode)}>
                                {getDatabaseModeLabel(store.databaseMode)}
                              </span>
                              {isLegacyDatabaseMode(store.databaseMode) ? (
                                <span className="pill pill-legacy">Legacy özel mod</span>
                              ) : null}
                            </div>
                            <div className="table-inline-meta">
                              {isLegacyDatabaseMode(store.databaseMode)
                                ? row.supabaseProjectRef || "Legacy yetki bekliyor"
                                : "Yeni Standart"}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Data mode okunamadi</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-text ${row.health.secretAuthorityReady ? "status-text-success" : "status-text-warning"}`}>
                          {row.health.secretAuthorityReady ? "Hazır" : "Drift"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-text ${row.health.adminDeploymentReady && row.health.adminRuntimeConsistent ? "status-text-success" : "status-text-error"}`}
                          title={row.health.adminRuntimeMessage || undefined}
                        >
                          {row.health.adminDeploymentReady
                            ? row.health.adminRuntimeConsistent
                              ? "Hazır"
                              : "Drift"
                            : "Kapalı"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-text ${row.consistency.blocking ? "status-text-error" : "status-text-success"}`}
                          title={
                            row.consistency.issues.length > 0
                              ? row.consistency.issues.map((issue) => issue.message).join(" / ")
                              : undefined
                          }
                        >
                          {row.consistency.blocking ? `${row.consistency.blockingIssueCount} blok` : "Temiz"}
                        </span>
                      </td>
                      <td>
                        <div className="table-stack">
                          <span className={`status-text ${row.r2BucketName ? "status-text-success" : "status-text-error"}`}>
                            {row.r2BucketName || "R2 eksik"}
                          </span>
                          <span className="table-inline-meta">{row.pendingOrderCount} bekleyen sipariş</span>
                        </div>
                      </td>
                      <td>{formatDateTime(row.lastSyncedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </OwnerDataTableShell>

        <div className="card">
          <div className="card-title">Son Operasyon Aktiviteleri</div>
          {summary.recentActivity.length === 0 ? (
            <p className="muted">Henüz aktivite kaydı yok.</p>
          ) : (
            <div className="activity-list">
              {summary.recentActivity.map((item) => (
                <div key={item.id} className="activity-item">
                  <div>
                    <strong>{item.targetLabel}</strong>
                    <p>{item.action.replaceAll("_", " ")}</p>
                  </div>
                  <div className="activity-meta">
                    <span>{item.actorName}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card section-tight">
        <div className="card-title">Temizlik Kayıtları</div>
        {summary.cleanupRuns.length === 0 ? (
          <p className="muted">Unresolved cleanup kaydi yok.</p>
        ) : (
          <div className="stack-list stack-top-sm">
            {summary.cleanupRuns.map((run) => (
              <div key={run.id} className="inline-card">
                <div>
                  <strong>{run.storeName}</strong>
                  <p>{run.slug}</p>
                </div>
                <div className="activity-meta">
                  <span>{run.status}</span>
                  <span>{run.orphanedTargetCount} orphan</span>
                  <span>{formatDateTime(run.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
