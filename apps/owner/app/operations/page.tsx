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
        overline="Operations Layer"
        title="Operasyon komuta kati"
        copy="Light Postgres standardi, generated app authority, orphan cleanup akislari ve legacy istisnalar tek komuta yuzeyinde izlenir."
        metrics={[
          { label: "Hazir store", value: summary.totals.readyStores, note: "Canliya yakin operasyon paketi" },
          { label: "Kurulum aksiyonu", value: setupQueueCount, note: "Auth, analytics veya payment bekleyenler" },
          { label: "Cleanup kuyrugu", value: summary.totals.orphanedCleanupRuns, note: `${repairQueueCount} repair queue / ${legacyStoreCount} legacy mode` },
        ]}
        panelTitle="Operasyon sinyalleri"
        panelItems={[
          { label: "Consistency block", value: summary.totals.consistencyBlockingStores },
          { label: "Secret drift", value: summary.totals.secretDrift },
          { label: "Yeni standart disi magazalar", value: legacyStoreCount },
          { label: "Repair queue", value: repairQueueCount },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">
              {superAdmin ? "Repair controls active" : "Observation mode"}
            </span>
            <span className={`hero-chip ${warningCount > 0 ? "hero-chip-neutral" : "hero-chip-accent"}`}>
              {warningCount > 0 ? "Dikkat isteyen akim var" : "Operasyon temiz"}
            </span>
          </>
        }
      />

      {superAdmin ? (
        <div className="admin-command-grid">
          <div className="admin-command-card">
            <div className="section-head">
              <div>
                <div className="card-title">Deployment branch authority</div>
                <p className="section-copy">
                  Owner resource yanlislikla `main` uzerinden deploy oluyorsa ya da auto deploy
                  kapanmissa buradan tek tusla `deploy/owner` branch&apos;i ve otomatik deployment
                  ayari onarilir.
                </p>
              </div>
              <RepairOwnerDeploymentBranchButton
                disabled={repairDisabled}
                disabledReason={repairDisabledReason}
              />
            </div>
            <div className="hero-chip-row">
              <span className="hero-chip hero-chip-accent">Dark command card</span>
              <span className="hero-chip hero-chip-neutral">Owner deployment rail</span>
            </div>
          </div>

          <div className="admin-command-card">
            <div className="section-head">
              <div>
                <div className="card-title">Store deployment authority</div>
                <p className="section-copy">
                  Mevcut store resource&apos;lari `deploy/storefront/&lt;slug&gt;` ve `deploy/owner`
                  branch authority&apos;sine alinip auto deploy acik hale getirilir. Yeni store&apos;lar
                  artik varsayilan olarak bu ayarla olusur.
                </p>
              </div>
              <RepairAllStoreDeploymentAuthoritiesButton
                disabled={repairDisabled}
                disabledReason={repairDisabledReason}
              />
            </div>
            <div className="hero-chip-row">
              <span className="hero-chip hero-chip-accent">Store rail sync</span>
              <span className="hero-chip hero-chip-neutral">Auto deploy standard</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="owner-metric-grid">
        <OwnerMetricCard label="Hazir store" value={summary.totals.readyStores} note="Ready lifecycle" tone="success" />
        <OwnerMetricCard label="Yeni standart disi" value={legacyStoreCount} note="Legacy mode" tone={legacyStoreCount > 0 ? "legacy" : "neutral"} />
        <OwnerMetricCard label="Auth bekleyen" value={pendingAuthCount} note="Logto-ready placeholder" tone={pendingAuthCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Analytics bekleyen" value={pendingAnalyticsCount} note="Umami-ready placeholder" tone={pendingAnalyticsCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Payment bekleyen" value={pendingPaymentCount} note="Tahsilat authority" tone={pendingPaymentCount > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="R2 eksik" value={summary.totals.missingR2} note="Media authority" tone={summary.totals.missingR2 > 0 ? "danger" : "success"} />
        <OwnerMetricCard label="Secret drift" value={summary.totals.secretDrift} note="Authority drift" tone={summary.totals.secretDrift > 0 ? "warning" : "success"} />
        <OwnerMetricCard label="Runtime sorunu" value={summary.totals.adminRuntimeIssues} note="Admin runtime" tone={summary.totals.adminRuntimeIssues > 0 ? "danger" : "success"} />
        <OwnerMetricCard label="Orphan cleanup" value={summary.totals.orphanedCleanupRuns} note="Cleanup queue" tone={summary.totals.orphanedCleanupRuns > 0 ? "warning" : "success"} />
      </div>

      <OwnerActionPanel
        title="Preview-disabled aksiyonlar"
        copy="Preview ortaminda repair, cleanup ve deploy aksiyonlari read-only guard altinda tutulur; operasyon ekrani yine de queue durumunu gostermeye devam eder."
        tone="accent"
        actions={
          <>
            <OwnerStatusChip tone={repairDisabled ? "warning" : "success"}>
              Repair {repairDisabled ? "kapali" : "aktif"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="ink">Cleanup queue {summary.totals.orphanedCleanupRuns}</OwnerStatusChip>
          </>
        }
      />

      <div className="split-grid">
        <OwnerDataTableShell
          title="Operasyon queue"
          copy="Store satirlari lifecycle, setup, data mode ve runtime guardrail sinyalleriyle izlenir."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proje</th>
                  <th>Lifecycle</th>
                  <th>Setup</th>
                  <th>Data Mode</th>
                  <th>Secrets</th>
                  <th>Admin Runtime</th>
                  <th>Consistency</th>
                  <th>Media</th>
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
                          Pending step: {row.provisioning.pendingStepCount} / Storefront: {row.storefrontStatus}
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
                                ? `${pendingSetupSignals.length} bekleyen setup adimi`
                                : "Owner setup queue temiz"}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Setup okunamadi</span>
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
                                <span className="pill pill-legacy">legacy mode</span>
                              ) : null}
                            </div>
                            <div className="table-inline-meta">
                              {isLegacyDatabaseMode(store.databaseMode)
                                ? row.supabaseProjectRef || "Legacy authority bekliyor"
                                : "Light Postgres standard"}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Data mode okunamadi</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-text ${row.health.secretAuthorityReady ? "status-text-success" : "status-text-warning"}`}>
                          {row.health.secretAuthorityReady ? "Hazir" : "Drift"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-text ${row.health.adminDeploymentReady && row.health.adminRuntimeConsistent ? "status-text-success" : "status-text-error"}`}
                          title={row.health.adminRuntimeMessage || undefined}
                        >
                          {row.health.adminDeploymentReady
                            ? row.health.adminRuntimeConsistent
                              ? "Hazir"
                              : "Drift"
                            : "Kapali"}
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
                          <span className="table-inline-meta">{row.pendingOrderCount} bekleyen siparis</span>
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
        <div className="card-title">Orphan Cleanup Runs</div>
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
