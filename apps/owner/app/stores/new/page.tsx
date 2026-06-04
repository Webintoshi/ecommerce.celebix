import {
  getDefaultAdminDeploymentBranch,
  getStorefrontDeploymentBranchPrefix,
} from "@/lib/platform-config-owner";
import { CreateStoreForm } from "@/components/CreateStoreForm";
import {
  OwnerCommandHero,
  OwnerLifecycleStepper,
  OwnerStatusChip,
} from "@/components/owner-control";
import { requireOwnerAuth, requireSuperAdmin } from "@/lib/owner-auth";
import { getLightPostgresBootstrapStatus } from "@/lib/light-postgres-provisioning";
import {
  getOwnerPreviewDisabledNotice,
  getOwnerPreviewFlags,
  isOwnerActionDisabled,
} from "@/lib/preview-mode";
import { getSupabaseBootstrapStatus } from "@/lib/supabase-bootstrap";

export default async function NewStorePage() {
  requireSuperAdmin(await requireOwnerAuth("/stores/new"));
  const previewFlags = getOwnerPreviewFlags();
  const createStoreDisabled = isOwnerActionDisabled("create_store", previewFlags);
  const createStoreDisabledReason =
    getOwnerPreviewDisabledNotice("create_store", previewFlags) ?? undefined;
  const lightPostgresBootstrap = await getLightPostgresBootstrapStatus();
  const supabaseBootstrap = await getSupabaseBootstrapStatus();

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
              Yeni Standart {lightPostgresBootstrap.configured ? "hazır" : "kontrol bekliyor"}
            </OwnerStatusChip>
            <OwnerStatusChip tone={supabaseBootstrap.configured ? "legacy" : "ink"}>
              Legacy {supabaseBootstrap.configured ? "hazır" : "ayrık"}
            </OwnerStatusChip>
            {createStoreDisabled ? <OwnerStatusChip tone="warning">Yazma işlemleri kapalı</OwnerStatusChip> : null}
          </>
        }
        panelTitle="Kurulum sırası"
        panelItems={[
          { label: "1. Marka", value: "Mağaza bilgileri" },
          { label: "2. Domain", value: "Yayın kimliği" },
          { label: "3. Tema", value: "Sektör dili" },
          { label: "4. Admin", value: "Başlangıç erişimi" },
          { label: "5. Ticaret", value: "Ödeme ve kargo" },
          { label: "6. Sistem", value: "Yeni standart" },
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
          <div className="owner-action-panel tone-accent">
            <div>
              <div className="card-title">Kurulum rehberi</div>
              <p className="section-copy">
                Teknik veritabanı modu ana seçim olmaktan çıkarıldı; Yeni Standart varsayılan,
                Legacy akışı ise Advanced alanında tutulur.
              </p>
            </div>
            <OwnerLifecycleStepper
              steps={[
                { label: "Mağaza bilgileri", detail: "Ad, slug ve marka dili", state: "current" },
                { label: "Domain", detail: "Vitrin ve admin kimliği", state: "pending" },
                { label: "Tema / sektör", detail: "İlk tasarım şablonu", state: "pending" },
                { label: "Admin kullanıcı", detail: "Başlangıç erişimi", state: "pending" },
                { label: "Ödeme / kargo", detail: "Başlangıç ticaret ayarları", state: "pending" },
                { label: "Yeni sistem kurulumu", detail: "Yeni Standart + R2 + kurulum istekleri", state: "pending" },
              ]}
            />
          </div>
        </aside>

        <div className="owner-wizard-form-panel">
          <CreateStoreForm
            ownerDeploymentBranch={getDefaultAdminDeploymentBranch()}
            storefrontBranchPrefix={getStorefrontDeploymentBranchPrefix()}
            disabled={createStoreDisabled}
            disabledReason={createStoreDisabledReason}
          />
        </div>
      </div>
    </>
  );
}
