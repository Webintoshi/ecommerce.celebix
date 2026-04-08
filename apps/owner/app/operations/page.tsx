import { formatDateTime } from "@/lib/formatters";
import { requireOwnerAuth } from "@/lib/owner-auth";
import { getOperationsSummary } from "@/lib/control-plane";

export default async function OperationsPage() {
  const auth = await requireOwnerAuth("/operations");
  const summary = await getOperationsSummary(auth);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Operasyon</h1>
          <p>Supabase, R2, storefront, admin kapsama alani ve aktiviteleri tek panelden izle.</p>
        </div>
      </div>

      {/* Operation Metrics */}
      <div className="metric-row metric-row-6">
        <div className="metric-box">
          <div className="metric-box-label">Hazir Store</div>
          <div className="metric-box-value" style={{ color: "var(--success)" }}>
            {summary.totals.readyStores}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Supabase Eksik</div>
          <div className="metric-box-value" style={{ color: summary.totals.missingSupabase > 0 ? "var(--error)" : "inherit" }}>
            {summary.totals.missingSupabase}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">R2 Eksik</div>
          <div className="metric-box-value" style={{ color: summary.totals.missingR2 > 0 ? "var(--error)" : "inherit" }}>
            {summary.totals.missingR2}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Admin Eksik</div>
          <div className="metric-box-value" style={{ color: summary.totals.missingAdmins > 0 ? "var(--warning)" : "inherit" }}>
            {summary.totals.missingAdmins}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Secret Drift</div>
          <div className="metric-box-value" style={{ color: summary.totals.secretDrift > 0 ? "var(--warning)" : "inherit" }}>
            {summary.totals.secretDrift}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Runtime Sorunu</div>
          <div className="metric-box-value" style={{ color: summary.totals.adminRuntimeIssues > 0 ? "var(--error)" : "inherit" }}>
            {summary.totals.adminRuntimeIssues}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Consistency Block</div>
          <div className="metric-box-value" style={{ color: summary.totals.consistencyBlockingStores > 0 ? "var(--error)" : "inherit" }}>
            {summary.totals.consistencyBlockingStores}
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Storefront Bekleyen</div>
          <div className="metric-box-value">{summary.totals.pendingStorefronts}</div>
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
                      <span style={{ 
                        color: row.supabaseProjectRef ? "var(--success)" : "var(--error)",
                        fontWeight: 600
                      }}>
                        {row.supabaseProjectRef || "Eksik"}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          color: row.health.secretAuthorityReady ? "var(--success)" : "var(--warning)",
                          fontWeight: 600
                        }}
                      >
                        {row.health.secretAuthorityReady ? "Hazir" : "Drift"}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          color:
                            row.health.adminDeploymentReady && row.health.adminRuntimeConsistent
                              ? "var(--success)"
                              : "var(--error)",
                          fontWeight: 600
                        }}
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
                        style={{
                          color: row.consistency.blocking ? "var(--error)" : "var(--success)",
                          fontWeight: 600
                        }}
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
                      <span style={{ 
                        color: row.r2BucketName ? "var(--success)" : "var(--error)",
                        fontWeight: 600
                      }}>
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
    </>
  );
}
