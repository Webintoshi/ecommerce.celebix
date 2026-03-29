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
          <p>Supabase, R2, storefront, admin kapsama alani ve son owner aktivitelerini tek panelden izle.</p>
        </div>
      </div>

      <div className="metric-row metric-row-5">
        <div className="metric-box">
          <div className="metric-box-label">Hazir store</div>
          <div className="metric-box-value">{summary.totals.readyStores}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Supabase eksik</div>
          <div className="metric-box-value">{summary.totals.missingSupabase}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">R2 eksik</div>
          <div className="metric-box-value">{summary.totals.missingR2}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Admin kapsami eksik</div>
          <div className="metric-box-value">{summary.totals.missingAdmins}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Storefront bekleyen</div>
          <div className="metric-box-value">{summary.totals.pendingStorefronts}</div>
        </div>
      </div>

      <div className="split-grid">
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proje</th>
                  <th>Saglik</th>
                  <th>Supabase</th>
                  <th>R2</th>
                  <th>Storefront</th>
                  <th>Son sync</th>
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
                      <span className={`pill ${row.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>{row.health.label}</span>
                    </td>
                    <td>{row.supabaseProjectRef || "Eksik"}</td>
                    <td>{row.r2BucketName || "Eksik"}</td>
                    <td>{row.storefrontStatus}</td>
                    <td>{formatDateTime(row.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Son operasyon aktiviteleri</div>
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
        </div>
      </div>
    </>
  );
}
