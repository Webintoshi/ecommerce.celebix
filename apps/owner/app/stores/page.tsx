import Link from "next/link";
import { LaunchStorefrontButton } from "@/components/LaunchStorefrontButton";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/formatters";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { listDashboardStores } from "@/lib/control-plane";

export default async function StoresPage() {
  const auth = await requireOwnerAuth("/stores");
  const superAdmin = isSuperAdmin(auth);
  const stores = await listDashboardStores(auth);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projeler</h1>
          <p>Her magazanin durumunu, gelirini, admin kapsamasini ve sagligini buradan yonet.</p>
        </div>
        {superAdmin ? (
          <Link className="button button-primary" href="/stores/new">
            + Yeni proje
          </Link>
        ) : null}
      </div>

      <div className="card">
        {stores.length === 0 ? (
          <div className="empty-state">
            <h3>Henüz Proje Yok</h3>
            <p>İlk projeyi oluşturmak için "Yeni proje" butonuna tıklayın.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proje</th>
                  <th>Client</th>
                  <th>Saglik</th>
                  <th>Admin</th>
                  <th>Ciro</th>
                  <th>Son sync</th>
                  <th style={{ textAlign: "right" }}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td>
                      <strong>{store.name}</strong>
                      <div className="table-inline-meta">{store.storefrontDomain}</div>
                    </td>
                    <td>
                      <strong>{store.management.clientCompanyName || store.name}</strong>
                      <div className="table-inline-meta">{store.management.internalOwner || "Atanmadi"}</div>
                    </td>
                    <td>
                      <span className={`pill ${store.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>
                        {store.health.label}
                      </span>
                      <div className="table-inline-meta">
                        Runtime: {store.health.adminRuntimeConsistent ? "hazir" : "sorunlu"} / Secrets: {store.health.secretAuthorityReady ? "hazir" : "drift"} / Consistency: {store.consistency.blocking ? `${store.consistency.blockingIssueCount} blok` : "temiz"}
                      </div>
                    </td>
                    <td>
                      <strong>{store.storeAdminCount}</strong>
                      <div className="table-inline-meta">
                        Affiliate: %{formatPercent(store.totalAffiliateRate)}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {formatCurrency(store.totalRevenue)}
                    </td>
                    <td>{formatDateTime(store.lastSyncedAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="actions no-margin" style={{ justifyContent: "flex-end" }}>
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
