import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { listAffiliates, listDashboardStores } from "@/lib/control-plane";

export default async function AffiliatesPage() {
  const auth = await requireOwnerAuth("/affiliates");
  const superAdmin = isSuperAdmin(auth);

  let affiliates: Awaited<ReturnType<typeof listAffiliates>> = [];
  let stores: Awaited<ReturnType<typeof listDashboardStores>> = [];

  try {
    stores = await listDashboardStores(auth);
    affiliates = superAdmin ? await listAffiliates() : [];
  } catch {
    // Hata durumunda boş listelerle devam et
  }

  const totalAssignments = affiliates.reduce((sum, affiliate) => sum + affiliate.assignments.length, 0);
  const totalCommission = affiliates.reduce(
    (sum, affiliate) => sum + affiliate.assignments.reduce((inner, assignment) => inner + assignment.commissionRate, 0),
    0,
  );
  const averageCommission = totalAssignments > 0 ? (totalCommission / totalAssignments).toFixed(1) : "0.0";

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="hero-stack">
            <span className="hero-overline">{superAdmin ? "Affiliate Command" : "Partner View"}</span>
            <div>
              <h1>Affiliate yonetimi</h1>
              <p>Gelir ortaklarini Celebix marka diliyle kur, proje ata ve komisyon sistemini tek premium panelde yonet.</p>
            </div>
          </div>

          <div className="hero-quick-metrics">
            <div className="hero-kpi">
              <span>Kayitli partner</span>
              <strong>{affiliates.length}</strong>
              <small>{stores.length} proje havuzu icinde</small>
            </div>
            <div className="hero-kpi">
              <span>Aktif atama</span>
              <strong>{totalAssignments}</strong>
              <small>Her atama proje bazli komisyon tasir</small>
            </div>
            <div className="hero-kpi">
              <span>Ortalama komisyon</span>
              <strong>%{averageCommission}</strong>
              <small>Super admin bazli ayarlanabilir</small>
            </div>
          </div>
        </div>

        <aside className="dashboard-hero-panel">
          <div className="card-title">Affiliate panel notlari</div>
          <div className="hero-list">
            <div className="hero-list-item">
              <span>Gorunurluk siniri</span>
              <strong>Kendi portfoyu</strong>
            </div>
            <div className="hero-list-item">
              <span>Komisyon mantigi</span>
              <strong>Partner bazli</strong>
            </div>
            <div className="hero-list-item">
              <span>Atanabilir proje</span>
              <strong>{stores.length}</strong>
            </div>
          </div>
          <div className="hero-chip-row">
            <span className="hero-chip hero-chip-accent">Brand locked palette</span>
            <span className="hero-chip hero-chip-neutral">{superAdmin ? "Super admin controls" : "Read-only partner scope"}</span>
          </div>
        </aside>
      </section>

      <div className="info-row">
        <div className="card surface-brand">
          <div className="card-title">Yeni Affiliate Ekle</div>
          {superAdmin ? (
            <CreateAffiliateForm stores={stores.map((store) => ({ slug: store.slug, name: store.name }))} />
          ) : (
            <div className="empty-state empty-state-compact">
              <p className="muted">Bu islem icin super admin yetkisi gerekli.</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Kayitli Affiliate Hesaplari</div>
          {affiliates.length === 0 ? (
            <div className="empty-state empty-state-compact">
              <p className="muted">Henuz affiliate hesabi yok.</p>
            </div>
          ) : (
            <div className="affiliate-grid">
              {affiliates.map((affiliate) => {
                const affiliateAverage =
                  affiliate.assignments.length > 0
                    ? (
                        affiliate.assignments.reduce((sum, assignment) => sum + assignment.commissionRate, 0) /
                        affiliate.assignments.length
                      ).toFixed(1)
                    : "0.0";
                const highestRate =
                  affiliate.assignments.length > 0
                    ? Math.max(...affiliate.assignments.map((assignment) => assignment.commissionRate)).toFixed(0)
                    : "0";

                return (
                  <div key={affiliate.id} className="affiliate-card">
                    <div className="affiliate-card-head">
                      <div>
                        <span className="hero-card-label">Affiliate profil</span>
                        <strong>{affiliate.fullName || affiliate.email}</strong>
                        <p className="muted">{affiliate.email}</p>
                      </div>
                      <span className={`pill ${affiliate.assignments.length > 0 ? "pill-success" : "pill-warning"}`}>
                        {affiliate.assignments.length > 0 ? "Aktif" : "Bos"}
                      </span>
                    </div>

                    <div className="affiliate-card-stats">
                      <div className="affiliate-card-stat">
                        <span>Atama</span>
                        <strong>{affiliate.assignments.length}</strong>
                      </div>
                      <div className="affiliate-card-stat">
                        <span>Ortalama</span>
                        <strong>%{affiliateAverage}</strong>
                      </div>
                      <div className="affiliate-card-stat">
                        <span>En yuksek</span>
                        <strong>%{highestRate}</strong>
                      </div>
                    </div>

                    <div className="affiliate-card-tags">
                      {affiliate.assignments.length === 0 ? (
                        <span className="pill pill-warning">Atama bekleniyor</span>
                      ) : null}
                      {affiliate.assignments.map((assignment) => (
                        <span key={`${affiliate.id}-${assignment.storeId}`} className="pill pill-accent">
                          {assignment.storeName} | %{assignment.commissionRate}
                        </span>
                      ))}
                    </div>

                    <div className="affiliate-card-meta">
                      <span>Gizlilik: yalnizca kendi store akisi</span>
                      <span>Yetki: proje + komisyon gorunumu</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!superAdmin ? (
        <div className="card surface-alert">
          <div className="card-title">Scope notu</div>
          <p className="section-copy">
            Affiliate kullanicilari sadece kendi proje, komisyon ve musteri akislarini gorebilir. Diger partner portfoyleri bu yuzeyde listelenmez.
          </p>
        </div>
      ) : null}
    </>
  );
}
