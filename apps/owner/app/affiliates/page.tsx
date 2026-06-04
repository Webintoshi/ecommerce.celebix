import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import {
  OwnerActionPanel,
  OwnerCommandHero,
  OwnerMetricCard,
  OwnerSectionHeader,
  OwnerStatusChip,
} from "@/components/owner-control";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
import { listAffiliates, listDashboardStores } from "@/lib/control-plane";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";

export default async function AffiliatesPage() {
  const auth = await requireOwnerAuth("/affiliates");
  const superAdmin = isSuperAdmin(auth);
  const previewFlags = getOwnerPreviewFlags();
  const writeDisabled = isOwnerActionDisabled("write", previewFlags);
  const writeDisabledReason = getOwnerPreviewDisabledNotice("write", previewFlags) ?? undefined;

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
      <OwnerCommandHero
        overline="Affiliate Paneli"
        title="Affiliate Paneli"
        copy="Gelir ortakları, mağaza atamaları ve komisyon akışı tek ürünleşmiş panelde izlenir."
        metrics={[
          { label: "Kayıtlı partner", value: affiliates.length, note: `${stores.length} mağaza havuzu içinde` },
          { label: "Aktif atama", value: totalAssignments, note: "Her atama mağaza bazlı komisyon taşır" },
          { label: "Ortalama komisyon", value: `%${averageCommission}`, note: "Yönetici tarafından ayarlanır" },
        ]}
        actions={
          <>
            <OwnerStatusChip tone={writeDisabled ? "warning" : "success"}>
              {writeDisabled ? "Yazma işlemleri kapalı" : "Kayıt oluşturma açık"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="accent">{stores.length} atanabilir mağaza</OwnerStatusChip>
          </>
        }
        panelTitle="Affiliate notları"
        panelItems={[
          { label: "Görünürlük sınırı", value: "Kendi portföyü" },
          { label: "Komisyon mantığı", value: "Partner bazlı" },
          { label: "Atanabilir mağaza", value: stores.length },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">Affiliate akışı</span>
            <span className="hero-chip hero-chip-neutral">{superAdmin ? "Yönetici kontrolleri" : "Sınırlı partner görünümü"}</span>
          </>
        }
      />

      <div className="owner-metric-grid">
        <OwnerMetricCard label="Toplam affiliate" value={affiliates.length} note="Kayıtlı partner" tone="accent" />
        <OwnerMetricCard label="Bekleyen mağaza isteği" value="Planlandı" note="Partner kurulum istekleri" tone="warning" />
        <OwnerMetricCard label="Bekleyen komisyon" value="Planlandı" note="Ödeme kuyruğu hazırlığı" />
        <OwnerMetricCard label="Ödenen komisyon" value="Planlandı" note="Fatura entegrasyonu sonrası" />
      </div>

      <OwnerSectionHeader
        eyebrow="Affiliate Paneli"
        title="Partner operasyon akışı"
        copy="Bu yüzey; mağaza istekleri, komisyon akışı ve partner erişimini ayrı bloklar halinde taşır."
      />

      <div className="info-row info-row-3">
        <OwnerActionPanel title="Mağaza istekleri" copy="Partnerlerden gelecek yeni mağaza kurulum talepleri burada izlenecek." tone="accent">
          <div className="hero-chip-row">
            <span className="pill provisioning-tone-pending_payment">bekleyen talep alanı</span>
            <span className="pill pill-ink">planlandı</span>
          </div>
        </OwnerActionPanel>
        <OwnerActionPanel title="Komisyon akışı" copy="Bekleyen, onaylanan ve ödenen komisyonlar fatura entegrasyonu ile ayrışacak.">
          <div className="hero-chip-row">
            <span className="pill pill-accent">ödeme paneli hazırlığı</span>
            <span className="pill pill-ink">okuma modeli</span>
          </div>
        </OwnerActionPanel>
        <OwnerActionPanel title="Affiliate erişimi" copy="Partnerin yalnız kendi mağazalarını ve gelir etkisini göreceği ayrık erişim katmanı.">
          <div className="hero-chip-row">
            <span className="pill pill-success">yetki kontrollü</span>
            <span className="pill pill-ink">planlandı</span>
          </div>
        </OwnerActionPanel>
      </div>

      <div className="info-row">
        <div className="card surface-brand">
          <div className="card-title">Yeni Affiliate Ekle</div>
          {superAdmin ? (
            <CreateAffiliateForm
              stores={stores.map((store) => ({ slug: store.slug, name: store.name }))}
              disabled={writeDisabled}
              disabledReason={writeDisabledReason}
            />
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
                      <span>Yetki: mağaza + komisyon görünümü</span>
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
            Affiliate kullanıcıları sadece kendi mağaza, komisyon ve müşteri akışlarını görebilir. Diğer partner portföyleri bu yüzeyde listelenmez.
          </p>
        </div>
      ) : null}
    </>
  );
}
