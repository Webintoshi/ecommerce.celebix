import {
  getDefaultAdminDeploymentBranch,
  getStorefrontDeploymentBranchPrefix,
} from "@/lib/platform-config-owner";
import { CreateStoreForm } from "@/components/CreateStoreForm";
import {
  OwnerCommandHero,
  OwnerLifecycleStepper,
  OwnerSectionCard,
  OwnerStatusChip,
  PreflightChecklist,
} from "@/components/owner-control";
import { requireOwnerAuth, requireSuperAdmin } from "@/lib/owner-auth";
import { getLightPostgresBootstrapStatus } from "@/lib/light-postgres-provisioning";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";

export default async function NewStorePage() {
  requireSuperAdmin(await requireOwnerAuth("/stores/new"));
  const previewFlags = getOwnerPreviewFlags();
  const createStoreDisabled = isOwnerActionDisabled("create_store", previewFlags);
  const createStoreDisabledReason =
    getOwnerPreviewDisabledNotice("create_store", previewFlags) ?? undefined;
  const lightPostgresBootstrap = await getLightPostgresBootstrapStatus();
  const preflightItems = [
    { label: "Build server", ready: !previewFlags.provisioningDisabled, note: "Generated app build akışı yazma korumasıyla birlikte izlenir." },
    { label: "Coolify", ready: !previewFlags.deployActionsDisabled, note: "Admin/storefront deploy aksiyonları preview guard durumuna göre kilitlenir." },
    { label: "Git/GHCR", ready: !previewFlags.deployActionsDisabled, note: "Repo sync ve image publish hattı owner guard üzerinden okunur." },
    { label: "Cloudflare DNS", ready: !previewFlags.deployActionsDisabled, note: "Demo domain standardı create öncesi görünür tutulur." },
    { label: "light_postgres", ready: lightPostgresBootstrap.configured, note: lightPostgresBootstrap.configured ? "Varsayılan database standardı hazır." : "Database bootstrap config kontrol bekliyor." },
    { label: "Logto", ready: true, note: "Yeni store auth provider standardı Logto placeholder ile açılır." },
    { label: "R2", ready: true, note: "Medya storage standardı R2 olarak gösterilir." },
    { label: "Umami", ready: true, note: "Analytics provider standardı Umami olarak gösterilir." },
  ];
  const preflightBlocked = preflightItems.some((item) => !item.ready);
  const formDisabled = createStoreDisabled || preflightBlocked;
  const formDisabledReason =
    createStoreDisabledReason ||
    (preflightBlocked ? "Preflight kontrolleri tamamlanmadan mağaza oluşturma kapalıdır." : undefined);

  return (
    <>
      <OwnerCommandHero
        overline="Yeni Mağaza"
        title="Yeni mağaza kurulum akışı"
        copy="Yeni mağaza formu teknik bir create ekranı değil; marka, domain, tema, admin, ticaret ve Yeni Standart adımlarını sırayla taşıyan kurulum akışıdır."
        metrics={[
          { label: "Varsayılan standart", value: "Yeni Standart", note: "Celebix kurulum standardı" },
          { label: "Advanced Legacy", value: "Kapalı", note: "Legacy sadece özel modda" },
          {
            label: "Yazma işlemleri",
            value: createStoreDisabled ? "Kapalı" : "Açık",
            note: createStoreDisabled ? "Önizleme koruması aktif" : "Canlı kayıt aktif",
          },
        ]}
        actions={
          <>
            <OwnerStatusChip tone={lightPostgresBootstrap.configured ? "success" : "warning"}>
              Postgres {lightPostgresBootstrap.configured ? "hazır" : "kontrol bekliyor"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="success">Logto varsayılan</OwnerStatusChip>
            <OwnerStatusChip tone="success">Umami varsayılan</OwnerStatusChip>
            <OwnerStatusChip tone="success">R2 medya</OwnerStatusChip>
            <OwnerStatusChip tone="ink">Supabase kullanılmıyor</OwnerStatusChip>
            {createStoreDisabled ? <OwnerStatusChip tone="warning">Yazma işlemleri kapalı</OwnerStatusChip> : null}
          </>
        }
        panelTitle="Kurulum sırası"
        panelItems={[
          { label: "1. Temel Bilgiler", value: "Marka kimliği" },
          { label: "2. Domain", value: "Yayın kimliği" },
          { label: "3. Kurulum Standardı", value: "Yeni Standart" },
          { label: "4. Admin Kullanıcı", value: "Başlangıç erişimi" },
          { label: "5. Ödeme ve Kargo", value: "Başlangıç ayarı" },
          { label: "6. Önizleme ve Onay", value: "Son kontrol" },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">Kurulum Akışı</span>
            <span className="hero-chip hero-chip-neutral">
              {createStoreDisabled ? "Yazma işlemleri kapalı" : "Yeni Standart akışı aktif"}
            </span>
          </>
        }
      />

      <div className="owner-wizard-shell">
        <aside className="owner-wizard-rail">
          <OwnerSectionCard
            title="Preflight"
            copy="Create aksiyonu öncesi platform kontrolleri."
            tone={preflightBlocked ? "danger" : "success"}
            actions={
              <OwnerStatusChip tone={preflightBlocked ? "danger" : "success"}>
                {preflightBlocked ? "Create disabled" : "Create ready"}
              </OwnerStatusChip>
            }
          >
            <PreflightChecklist items={preflightItems} />
          </OwnerSectionCard>

          <div className="owner-action-panel tone-accent">
            <div>
              <div className="card-title">Kurulum rehberi</div>
              <p className="section-copy">
                Yeni mağaza akışı Postgres veritabanı, Logto kimlik doğrulama,
                Umami analitik ve R2 medya depolama standardıyla açılır.
              </p>
            </div>
            <OwnerLifecycleStepper
              steps={[
                { label: "Temel Bilgiler", detail: "Ad, slug ve marka dili", state: "current" },
                { label: "Domain", detail: "Vitrin ve admin kimliği", state: "pending" },
                { label: "Kurulum Standardı", detail: "Postgres + Logto + Umami + R2", state: "pending" },
                { label: "Admin Kullanıcı", detail: "Başlangıç erişimi", state: "pending" },
                { label: "Ödeme ve Kargo Başlangıcı", detail: "Paket ve ticaret ayarı", state: "pending" },
                { label: "Önizleme ve Onay", detail: "Son kontrol", state: "pending" },
              ]}
            />
          </div>
        </aside>

        <div className="owner-wizard-form-panel">
          <CreateStoreForm
            ownerDeploymentBranch={getDefaultAdminDeploymentBranch()}
            storefrontBranchPrefix={getStorefrontDeploymentBranchPrefix()}
            disabled={formDisabled}
            disabledReason={formDisabledReason}
          />
        </div>
      </div>
    </>
  );
}
