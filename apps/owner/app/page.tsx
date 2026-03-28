import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { listDashboardStores } from "@/lib/control-plane";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(value);
}

export default async function OwnerDashboardPage() {
  const auth = await requireOwnerAuth("/");
  const superAdmin = isSuperAdmin(auth);
  let dashboardError: string | null = null;
  let stores: Awaited<ReturnType<typeof listDashboardStores>> = [];

  try {
    stores = await listDashboardStores(auth);
  } catch (error) {
    dashboardError = error instanceof Error ? error.message : "Owner dashboard verisi yuklenemedi.";
  }

  const totals = stores.reduce(
    (accumulator, store) => ({
      revenue: accumulator.revenue + store.totalRevenue,
      orders: accumulator.orders + store.orderCount,
      customers: accumulator.customers + store.customerCount
    }),
    { revenue: 0, orders: 0, customers: 0 }
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Tum projelerinin ozeti ve canli metrikleri.</p>
        </div>
        {superAdmin ? (
          <Link className="button button-primary" href="/stores/new">
            + Yeni proje
          </Link>
        ) : null}
      </div>

      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-box-label">Toplam ciro</div>
          <div className="metric-box-value">{formatCurrency(totals.revenue)}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam siparis</div>
          <div className="metric-box-value">{totals.orders}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Toplam musteri</div>
          <div className="metric-box-value">{totals.customers}</div>
        </div>
        <div className="metric-box">
          <div className="metric-box-label">Aktif proje</div>
          <div className="metric-box-value">{stores.length}</div>
        </div>
      </div>

      {dashboardError ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <p className="form-error">{dashboardError}</p>
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">Projeler</div>
        {stores.length === 0 ? (
          <div className="empty-state">
            <h3>Henüz proje yok</h3>
            <p>İlk store kaydini olusturmak icin "Yeni proje" butonuna tikla.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proje</th>
                  <th>Domain</th>
                  <th>Durum</th>
                  <th>Ciro</th>
                  <th>Siparis</th>
                  <th style={{ textAlign: "right" }}>Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td>
                      <strong>{store.name}</strong>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {store.themeLabel}
                      </div>
                    </td>
                    <td>{store.storefrontDomain}</td>
                    <td>
                      <span className="pill pill-accent">{store.status}</span>
                    </td>
                    <td>{formatCurrency(store.totalRevenue)}</td>
                    <td>{store.orderCount}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="actions" style={{ justifyContent: "flex-end", margin: 0 }}>
                        <Link className="button button-secondary" href={`/stores/${store.slug}`}>
                          Detay
                        </Link>
                        {superAdmin ? (
                          <LaunchStorefrontButton slug={store.slug} currentStatus={store.storefrontStatus} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
