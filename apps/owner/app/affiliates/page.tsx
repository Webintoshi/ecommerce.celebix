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
        overline={superAdmin ? "Affiliate Command" : "Partner View"}
        title="Affiliate yonetimi"
        copy="Gelir ortaklari artik basit bir form listesi degil; proje atamasi, komisyon ritmi ve gelecek partner paneli icin urunlesmis bir operasyon alani."
        metrics={[
          { label: "Kayitli partner", value: affiliates.length, note: `${stores.length} proje havuzu icinde` },
          { label: "Aktif atama", value: totalAssignments, note: "Her atama proje bazli komisyon tasir" },
          { label: "Ortalama komisyon", value: `%${averageCommission}`, note: "Super admin bazli ayarlanabilir" },
        ]}
        actions={
          <>
            <OwnerStatusChip tone={writeDisabled ? "warning" : "success"}>
              {writeDisabled ? "Preview create kapali" : "Create aktif"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="accent">{stores.length} atanabilir proje</OwnerStatusChip>
          </>
        }
        panelTitle="Affiliate panel notlari"
        panelItems={[
          { label: "Gorunurluk siniri", value: "Kendi portfoyu" },
          { label: "Komisyon mantigi", value: "Partner bazli" },
          { label: "Atanabilir proje", value: stores.length },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">Brand locked palette</span>
            <span className="hero-chip hero-chip-neutral">{superAdmin ? "Super admin controls" : "Read-only partner scope"}</span>
          </>
        }
      />

      <div className="owner-metric-grid">
        <OwnerMetricCard label="Toplam affiliate" value={affiliates.length} note="Kayitli partner" tone="accent" />
        <OwnerMetricCard label="Bekleyen proje istegi" value="Roadmap" note="Partner onboarding queue" tone="warning" />
        <OwnerMetricCard label="Bekleyen komisyon" value="Planlandi" note="Payout queue hazirligi" />
        <OwnerMetricCard label="Odenen komisyon" value="Planlandi" note="Finance integration sonrasi" />
      </div>

      <OwnerSectionHeader
        eyebrow="Affiliate product layer"
        title="Partner operasyon akisi"
        copy="Bu yuzey gelecekte affiliate dashboard'a gececek sekilde proje, komisyon ve onboarding kartlarini ayri bloklar halinde tasir."
      />

      <div className="info-row info-row-3">
        <OwnerActionPanel title="Proje istekleri" copy="Partnerlerden gelecek yeni magaza kurulum talepleri burada queue olarak okunacak." tone="accent">
          <div className="hero-chip-row">
            <span className="pill provisioning-tone-pending_payment">bekleyen talep alani</span>
            <span className="pill pill-ink">roadmap</span>
          </div>
        </OwnerActionPanel>
        <OwnerActionPanel title="Komisyon akisi" copy="Bekleyen, onaylanan ve odenen komisyonlar finance entegrasyonu ile ayrisacak.">
          <div className="hero-chip-row">
            <span className="pill pill-accent">payout panel hazirligi</span>
            <span className="pill pill-ink">read model</span>
          </div>
        </OwnerActionPanel>
        <OwnerActionPanel title="Affiliate portal" copy="Partnerin yalniz kendi projelerini ve gelir etkisini gorecegi ayrik panel icin operasyon sinyali.">
          <div className="hero-chip-row">
            <span className="pill pill-success">scope kontrollu</span>
            <span className="pill pill-ink">future product</span>
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
