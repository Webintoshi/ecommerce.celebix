import { formatCurrency, formatPercent } from "@/lib/formatters";
import { requireOwnerAuth } from "@/lib/owner-auth";
import { getFinanceSummary } from "@/lib/control-plane";

export default async function FinancePage() {
  const auth = await requireOwnerAuth("/finance");
  const summary = await getFinanceSummary(auth);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Finans</h1>
          <p>Tek paket yapisinda tum magazalarin GMV, sepet ortalamasi ve affiliate etkisini tek ekranda izle.</p>
        </div>
      </div>

      <div className="metric-row metric-row-5">
        <div className="metric-box">
          <div className="metric-box-label">Toplam GMV</div>
          <div className="metric-box-value">{formatCurrency(summary.totals.revenue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam siparis</div>
          <div className="metric-box-value">{summary.totals.orders}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Sepet ortalamasi</div>
          <div className="metric-box-value">{formatCurrency(summary.totals.averageOrderValue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Affiliate etkisi</div>
          <div className="metric-box-value">{formatCurrency(summary.totals.affiliateExposure)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Bekleyen siparis</div>
          <div className="metric-box-value">{summary.totals.pendingOrders}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proje</th>
                <th>Durum</th>
                <th>GMV</th>
                <th>Siparis</th>
                <th>AOV</th>
                <th>Affiliate</th>
                <th>Tahmini pay</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <div className="table-inline-meta">{row.slug}</div>
                  </td>
                  <td>
                    <span className="pill pill-accent">{row.billingStatus}</span>
                  </td>
                  <td>{formatCurrency(row.totalRevenue)}</td>
                  <td>{row.orderCount}</td>
                  <td>{formatCurrency(row.averageOrderValue)}</td>
                  <td>
                    %{formatPercent(row.commissionRate ?? row.totalAffiliateRate)}
                  </td>
                  <td>{formatCurrency(row.estimatedAffiliateExposure)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
