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
          <p>Tum magazalarin GMV, sepet ortalamasi ve affiliate etkisini tek ekranda izle.</p>
        </div>
      </div>

      {/* Finance Metrics */}
      <div className="metric-row metric-row-6">
        <div className="metric-box">
          <div className="metric-box-label">Kurulum Geliri</div>
          <div className="metric-box-value">{formatCurrency(summary.totals.setupRevenue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam GMV</div>
          <div className="metric-box-value">{formatCurrency(summary.totals.revenue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam Siparis</div>
          <div className="metric-box-value">{summary.totals.orders.toLocaleString('tr-TR')}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Sepet Ortalamasi</div>
          <div className="metric-box-value">{formatCurrency(summary.totals.averageOrderValue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Affiliate Etkisi</div>
          <div className="metric-box-value">{formatCurrency(summary.totals.affiliateExposure)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Bekleyen Siparis</div>
          <div className="metric-box-value">{summary.totals.pendingOrders}</div>
        </div>
      </div>

      {/* Finance Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proje</th>
                <th>Durum</th>
                <th>Kurulum</th>
                <th>GMV</th>
                <th>Siparis</th>
                <th>AOV</th>
                <th>Affiliate</th>
                <th>Tahmini Pay</th>
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
                  <td>{formatCurrency(row.setupRevenue)}</td>
                  <td className="table-strong">{formatCurrency(row.totalRevenue)}</td>
                  <td>{row.orderCount.toLocaleString('tr-TR')}</td>
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
