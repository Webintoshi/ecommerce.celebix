import { CreateAffiliateForm } from "@/components/CreateAffiliateForm";
import {
  OwnerActionButton,
  OwnerActionQueue,
  OwnerEmptyState,
  OwnerKpiCard,
  OwnerPageHeader,
  OwnerSectionCard,
  OwnerStatusChip,
  OwnerTimeline,
} from "@/components/owner-control";
import { listAffiliates, listDashboardStores } from "@/lib/control-plane";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/formatters";
import { isSuperAdmin, requireOwnerAuth } from "@/lib/owner-auth";
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
    // Veriye erişilemezse panel boş durumla devam eder; yazma aksiyonları etkilenmez.
  }

  const totalAssignments = affiliates.reduce((sum, affiliate) => sum + affiliate.assignments.length, 0);
  const totalCommissionRate = affiliates.reduce(
    (sum, affiliate) =>
      sum + affiliate.assignments.reduce((inner, assignment) => inner + assignment.commissionRate, 0),
    0,
  );
  const activeAffiliateCount = affiliates.filter((affiliate) => affiliate.assignments.length > 0).length;
  const averageCommission = totalAssignments > 0 ? totalCommissionRate / totalAssignments : 0;
  const pendingProjectCount = Math.max(stores.length - totalAssignments, 0);
  const pendingCommissionAmount = 0;
  const paidCommissionAmount = 0;
  const recentAssignmentItems = affiliates
    .flatMap((affiliate) =>
      affiliate.assignments.map((assignment) => ({
        id: `${affiliate.id}-${assignment.storeId}`,
        affiliateName: affiliate.fullName || affiliate.email,
        storeName: assignment.storeName,
        commissionRate: assignment.commissionRate,
      })),
    )
    .slice(0, 5);

  return (
    <div className="affiliate-panel-page">
      <OwnerPageHeader
        eyebrow="Affiliate Paneli"
        title="Satış ortağı yönetimi"
        copy="Satış ortaklarını, proje isteklerini ve komisyon akışını yönetin."
        className="affiliate-page-header"
        chips={
          <>
            <OwnerStatusChip tone={writeDisabled ? "warning" : "success"}>
              {writeDisabled ? "Yazma işlemleri kapalı" : "Kayıt oluşturma açık"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="accent">{stores.length} atanabilir mağaza</OwnerStatusChip>
            <OwnerStatusChip tone={superAdmin ? "success" : "neutral"}>
              {superAdmin ? "Yönetici görünümü" : "Sınırlı görünüm"}
            </OwnerStatusChip>
          </>
        }
        actions={
          <>
            <OwnerActionButton href="/stores" tone="secondary">
              Mağazaları Gör
            </OwnerActionButton>
            <OwnerActionButton href="/operations" tone="ghost">
              Operasyonlar
            </OwnerActionButton>
          </>
        }
        aside={
          <div className="affiliate-command-card">
            <span>Komisyon Özeti</span>
            <strong>%{formatPercent(averageCommission)}</strong>
            <p>Ortalama komisyon oranı</p>
            <div className="affiliate-command-row">
              <small>{totalAssignments} aktif proje</small>
              <small>{pendingProjectCount} bekleyen proje</small>
            </div>
          </div>
        }
      />

      <div className="affiliate-kpi-grid">
        <OwnerKpiCard label="Toplam Affiliate" value={affiliates.length} note="Kayıtlı satış ortağı" tone="accent" />
        <OwnerKpiCard label="Aktif Affiliate" value={activeAffiliateCount} note={`${totalAssignments} proje ataması`} tone="success" />
        <OwnerKpiCard label="Bekleyen Proje İsteği" value={pendingProjectCount} note="Atama bekleyen mağaza havuzu" tone={pendingProjectCount > 0 ? "warning" : "neutral"} />
        <OwnerKpiCard label="Bekleyen Komisyon" value={formatCurrency(pendingCommissionAmount)} note="Ödeme kuyruğu hazırlandığında dolar" />
        <OwnerKpiCard label="Ödenen Komisyon" value={formatCurrency(paidCommissionAmount)} note="Fatura entegrasyonu sonrası" />
      </div>

      <div className="affiliate-layout-grid">
        <main className="affiliate-main-column">
          <OwnerSectionCard
            eyebrow="Satış Ortakları"
            title="Satış ortağı portföyü"
            copy="Her kart satış ortağı kimliğini, komisyon oranını, proje sayısını ve durumunu aynı seviyede gösterir."
            actions={
              <OwnerStatusChip tone={activeAffiliateCount > 0 ? "success" : "warning"}>
                {activeAffiliateCount > 0 ? `${activeAffiliateCount} aktif satış ortağı` : "Aktif satış ortağı yok"}
              </OwnerStatusChip>
            }
          >
            {affiliates.length === 0 ? (
              <OwnerEmptyState
                title="Satış ortağı yok"
                copy="Yeni satış ortağı eklendiğinde komisyon ve proje kartları burada görünür."
              />
            ) : (
              <div className="affiliate-partner-grid">
                {affiliates.map((affiliate) => {
                  const affiliateAverage =
                    affiliate.assignments.length > 0
                      ? affiliate.assignments.reduce((sum, assignment) => sum + assignment.commissionRate, 0) /
                        affiliate.assignments.length
                      : 0;
                  const highestRate =
                    affiliate.assignments.length > 0
                      ? Math.max(...affiliate.assignments.map((assignment) => assignment.commissionRate))
                      : 0;

                  return (
                    <article key={affiliate.id} className="affiliate-partner-card">
                      <div className="affiliate-partner-head">
                        <div>
                          <span>Satış Ortağı</span>
                          <strong>{affiliate.fullName || affiliate.email}</strong>
                          <p>{affiliate.email}</p>
                        </div>
                        <OwnerStatusChip tone={affiliate.assignments.length > 0 ? "success" : "warning"}>
                          {affiliate.assignments.length > 0 ? "Aktif" : "Atama bekliyor"}
                        </OwnerStatusChip>
                      </div>

                      <div className="affiliate-partner-stats">
                        <div>
                          <span>Proje</span>
                          <strong>{affiliate.assignments.length}</strong>
                        </div>
                        <div>
                          <span>Komisyon Oranı</span>
                          <strong>%{formatPercent(affiliateAverage)}</strong>
                        </div>
                        <div>
                          <span>En yüksek</span>
                          <strong>%{formatPercent(highestRate)}</strong>
                        </div>
                      </div>

                      <div className="affiliate-project-list">
                        {affiliate.assignments.length === 0 ? (
                          <OwnerStatusChip tone="warning">Yeni Proje İsteği bekliyor</OwnerStatusChip>
                        ) : (
                          affiliate.assignments.map((assignment) => (
                            <span key={`${affiliate.id}-${assignment.storeId}`}>
                              {assignment.storeName}
                              <strong>%{formatPercent(assignment.commissionRate)}</strong>
                            </span>
                          ))
                        )}
                      </div>

                      <div className="affiliate-partner-footer">
                        <span>Bekleyen ödeme: {formatCurrency(0)}</span>
                        <OwnerActionButton href="/affiliates" tone="ghost">
                          Detay
                        </OwnerActionButton>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </OwnerSectionCard>

          <OwnerSectionCard
            eyebrow="Yeni Satış Ortağı"
            title="Satış ortağı ekle"
            copy="Preview modunda form kilitli kalır; yazma işlemleri kapalı uyarısı görünür."
            tone={writeDisabled ? "warning" : "accent"}
          >
            {superAdmin ? (
              <CreateAffiliateForm
                stores={stores.map((store) => ({ slug: store.slug, name: store.name }))}
                disabled={writeDisabled}
                disabledReason={writeDisabledReason}
              />
            ) : (
              <OwnerEmptyState title="Yetki gerekli" copy="Bu işlem için süper yönetici yetkisi gerekir." />
            )}
          </OwnerSectionCard>
        </main>

        <aside className="affiliate-side-column">
          <OwnerSectionCard title="Komisyon Özeti" copy="Bekleyen ve ödenen komisyonlar fatura entegrasyonu sonrasında tutarlı şekilde izlenecek.">
            <div className="affiliate-summary-list">
              <span>Ortalama komisyon <strong>%{formatPercent(averageCommission)}</strong></span>
              <span>Bekleyen ödeme <strong>{formatCurrency(pendingCommissionAmount)}</strong></span>
              <span>Ödenen komisyon <strong>{formatCurrency(paidCommissionAmount)}</strong></span>
              <span>Aktif proje <strong>{totalAssignments}</strong></span>
            </div>
          </OwnerSectionCard>

          <OwnerSectionCard title="Proje İstek Akışı" tone={pendingProjectCount > 0 ? "accent" : "neutral"}>
            <OwnerActionQueue
              items={[
                {
                  id: "pending-projects",
                  title: "Bekleyen Proje",
                  detail:
                    pendingProjectCount > 0
                      ? "Atama bekleyen mağazalar satış ortağı havuzuna alınabilir."
                      : "Tüm mevcut mağazalar için satış ortağı ataması yapılmış görünüyor.",
                  meta: <strong>{pendingProjectCount}</strong>,
                  chips: <OwnerStatusChip tone={pendingProjectCount > 0 ? "warning" : "success"}>{pendingProjectCount > 0 ? "Takipte" : "Temiz"}</OwnerStatusChip>,
                  tone: pendingProjectCount > 0 ? "warning" : "success",
                },
                {
                  id: "commission-queue",
                  title: "Bekleyen Ödeme",
                  detail: "Komisyon ödeme kuyruğu fatura entegrasyonu sonrası canlı hesaplanacak.",
                  meta: <strong>{formatCurrency(pendingCommissionAmount)}</strong>,
                  chips: <OwnerStatusChip>Hazırlık</OwnerStatusChip>,
                },
              ]}
            />
          </OwnerSectionCard>

          <OwnerSectionCard title="Son Aktiviteler">
            <OwnerTimeline
              items={recentAssignmentItems.map((item) => ({
                id: item.id,
                title: item.affiliateName,
                detail: `${item.storeName} için komisyon oranı %{formatPercent(item.commissionRate)}`,
                meta: <strong>Proje ataması</strong>,
              }))}
              empty={<OwnerEmptyState title="Aktivite yok" copy="Satış ortağı atamaları oluştuğunda burada görünür." />}
            />
          </OwnerSectionCard>

          <OwnerSectionCard title="Hızlı Notlar" tone="accent">
            <div className="affiliate-note-list">
              <p>Satış ortakları yalnız kendi proje ve komisyon görünümüne erişir.</p>
              <p>Yeni Proje İsteği akışı production öncesi ayrı operasyon modeliyle bağlanmalı.</p>
              <p>Preview ortamında affiliate create formu bilinçli olarak kapalıdır.</p>
            </div>
          </OwnerSectionCard>
        </aside>
      </div>
    </div>
  );
}
