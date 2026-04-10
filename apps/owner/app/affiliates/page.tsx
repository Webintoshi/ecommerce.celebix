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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Affiliate Yonetimi</h1>
          <p>Gelir ortaklari olustur, proje ata ve komisyon oranlarini yonet.</p>
        </div>
      </div>

      <div className="info-row">
        <div className="card">
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
              <p className="muted">Henüz affiliate hesabi yok.</p>
            </div>
          ) : (
            <div className="stack-list">
              {affiliates.map((affiliate) => (
                <div key={affiliate.id} className="inline-card">
                  <div>
                    <strong>{affiliate.fullName || affiliate.email}</strong>
                    <p className="muted">
                      {affiliate.email}
                    </p>
                  </div>
                  <div className="actions no-margin status-actions">
                    {affiliate.assignments.map((assignment) => (
                      <span key={`${affiliate.id}-${assignment.storeId}`} className="pill pill-accent">
                        {assignment.storeName} | %{assignment.commissionRate}
                      </span>
                    ))}
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
