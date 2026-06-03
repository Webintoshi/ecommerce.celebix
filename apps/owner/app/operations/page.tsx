import { formatDateTime } from "@/lib/formatters";
import { RepairAllStoreDeploymentAuthoritiesButton } from "@/components/RepairAllStoreDeploymentAuthoritiesButton";
import { RepairOwnerDeploymentBranchButton } from "@/components/RepairOwnerDeploymentBranchButton";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { getOperationsSummary } from "@/lib/control-plane";

export default async function OperationsPage() {
  const auth = await requireOwnerAuth("/operations");
  const superAdmin = isSuperAdmin(auth);
  const summary = await getOperationsSummary(auth);
  const warningCount =
    summary.totals.missingSupabase +
    summary.totals.missingR2 +
    summary.totals.missingAdmins +
    summary.totals.secretDrift +
    summary.totals.adminRuntimeIssues +
    summary.totals.consistencyBlockingStores;

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="hero-stack">
            <span className="hero-overline">Operations Layer</span>
            <div>
              <h1>Operasyon komuta kati</h1>
              <p>Supabase, R2, storefront, admin kapsama alani ve operasyonel riskleri Celebix renk sistemiyle tek panelden izle.</p>
            </div>
          </div>

          <div className="hero-quick-metrics">
            <div className="hero-kpi">
              <span>Hazir store</span>
              <strong>{summary.totals.readyStores}</strong>
              <small>Canliya yakin operasyon paketi</small>
            </div>
            <div className="hero-kpi">
              <span>Uyari toplami</span>
              <strong>{warningCount}</strong>
              <small>Supabase, R2, admin ve consistency sinyalleri</small>
            </div>
            <div className="hero-kpi">
              <span>Cleanup kuyrugu</span>
              <strong>{summary.totals.orphanedCleanupRuns}</strong>
              <small>{summary.totals.pendingStorefronts} bekleyen storefront</small>
            </div>
          </div>
        </div>

        <aside className="dashboard-hero-panel">
          <div className="card-title">Operasyon sinyalleri</div>
          <div className="hero-list">
            <div className="hero-list-item">
              <span>Consistency block</span>
              <strong>{summary.totals.consistencyBlockingStores}</strong>
            </div>
            <div className="hero-list-item">
              <span>Secret drift</span>
              <strong>{summary.totals.secretDrift}</strong>
            </div>
            <div className="hero-list-item">
              <span>Runtime issue</span>
              <strong>{summary.totals.adminRuntimeIssues}</strong>
            </div>
          </div>
          <div className="hero-chip-row">
            <span className="hero-chip hero-chip-accent">{superAdmin ? "Repair controls active" : "Observation mode"}</span>
            <span className={`hero-chip ${warningCount > 0 ? "hero-chip-neutral" : "hero-chip-accent"}`}>
              {warningCount > 0 ? "Dikkat isteyen akim var" : "Operasyon temiz"}
            </span>
          </div>
        </aside>
      </section>

      {superAdmin ? (
        <div className="admin-command-grid">
          <div className="admin-command-card">
            <div className="section-head">
              <div>
                <div className="card-title">Deployment branch authority</div>
                <p className="section-copy">
                  Owner resource yanlislikla `main` uzerinden deploy oluyorsa ya da auto deploy kapanmissa buradan tek tusla `deploy/owner` branch&apos;i ve otomatik deployment ayari onarilir.
                </p>
              </div>
              <RepairOwnerDeploymentBranchButton />
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
                  Mevcut store resource&apos;lari `deploy/storefront/&lt;slug&gt;` ve `deploy/owner` branch authority&apos;sine alinip auto deploy acik hale getirilir. Yeni store&apos;lar artik varsayilan olarak bu ayarla olusur.
                </p>
              </div>
              <RepairAllStoreDeploymentAuthoritiesButton />
            </div>
            <div className="hero-chip-row">
              <span className="hero-chip hero-chip-accent">Store rail sync</span>
              <span className="hero-chip hero-chip-neutral">Auto deploy standard</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Operation Metrics */}
      <div className="metric-row metric-row-6">
        <div className="metric-box">
          <div className="metric-box-label">Hazir Store</div>
          <div className="metric-box-value status-text-success">
            {summary.totals.readyStores}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Supabase Eksik</div>
          <div className={`metric-box-value ${summary.totals.missingSupabase > 0 ? "status-text-error" : ""}`}>
            {summary.totals.missingSupabase}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">R2 Eksik</div>
          <div className={`metric-box-value ${summary.totals.missingR2 > 0 ? "status-text-error" : ""}`}>
            {summary.totals.missingR2}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Admin Eksik</div>
          <div className={`metric-box-value ${summary.totals.missingAdmins > 0 ? "status-text-warning" : ""}`}>
            {summary.totals.missingAdmins}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Secret Drift</div>
          <div className={`metric-box-value ${summary.totals.secretDrift > 0 ? "status-text-warning" : ""}`}>
            {summary.totals.secretDrift}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Runtime Sorunu</div>
          <div className={`metric-box-value ${summary.totals.adminRuntimeIssues > 0 ? "status-text-error" : ""}`}>
            {summary.totals.adminRuntimeIssues}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Consistency Block</div>
          <div className={`metric-box-value ${summary.totals.consistencyBlockingStores > 0 ? "status-text-error" : ""}`}>
            {summary.totals.consistencyBlockingStores}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Storefront Bekleyen</div>
          <div className="metric-box-value">{summary.totals.pendingStorefronts}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Orphan Cleanup</div>
          <div className={`metric-box-value ${summary.totals.orphanedCleanupRuns > 0 ? "status-text-warning" : ""}`}>
            {summary.totals.orphanedCleanupRuns}
          </div>
        </div>
      </div>

      {/* Operations Table & Activity */}
      <div className="split-grid">
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proje</th>
                  <th>Saglik</th>
                  <th>Supabase</th>
                  <th>Provisioning</th>
                  <th>Secrets</th>
                  <th>Admin Runtime</th>
                  <th>Consistency</th>
                  <th>R2</th>
                  <th>Storefront</th>
                  <th>Son Sync</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="table-inline-meta">{row.storefrontDomain}</div>
                    </td>
                    <td>
                      <span className={`pill ${row.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>
                        {row.health.label}
                      </span>
                    </td>
                    <td>
                      <span className={`status-text ${row.supabaseProjectRef ? "status-text-success" : "status-text-error"}`}>
                        {row.supabaseProjectRef || "Eksik"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-text ${row.provisioning.state === "ready" ? "status-text-success" : "status-text-warning"}`}>
                        {row.provisioning.state}
                      </span>
                    </td>
                    <td>
                      <span className={`status-text ${row.health.secretAuthorityReady ? "status-text-success" : "status-text-warning"}`}>
                        {row.health.secretAuthorityReady ? "Hazir" : "Drift"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-text ${row.health.adminDeploymentReady && row.health.adminRuntimeConsistent ? "status-text-success" : "status-text-error"}`} title={row.health.adminRuntimeMessage || undefined}>
                        {row.health.adminDeploymentReady
                          ? row.health.adminRuntimeConsistent
                            ? "Hazir"
                            : "Drift"
                          : "Kapali"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-text ${row.consistency.blocking ? "status-text-error" : "status-text-success"}`} title={row.consistency.issues.length > 0 ? row.consistency.issues.map((issue) => issue.message).join(" / ") : undefined}>
                        {row.consistency.blocking ? `${row.consistency.blockingIssueCount} blok` : "Temiz"}
                      </span>
                    </td>
                    <td>
                      <span className={`status-text ${row.r2BucketName ? "status-text-success" : "status-text-error"}`}>
                        {row.r2BucketName || "Eksik"}
                      </span>
                    </td>
                    <td>{row.storefrontStatus}</td>
                    <td>{formatDateTime(row.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

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
