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
        overline="New store setup"
        title="Yeni magaza kurulum akisi"
        copy="Yeni proje formu artik teknik create ekranindan cok bir kurulum rehberi gibi calisir: marka, domain, tema, admin, ticaret ve yeni Celebix standardi tek sirada ilerler."
        metrics={[
          { label: "Varsayilan standart", value: "light_postgres", note: "Yeni Celebix Standardi" },
          { label: "Advanced legacy", value: "Kapali", note: "Full Supabase sadece ozel modda" },
          { label: "Preview state", value: createStoreDisabled ? "Read-only" : "Create acik", note: createStoreDisabled ? "Submit kilitli" : "Canli create aktif" },
        ]}
        actions={
          <>
            <OwnerStatusChip tone={lightPostgresBootstrap.configured ? "success" : "warning"}>
              Light Postgres {lightPostgresBootstrap.configured ? "hazir" : "preflight bekliyor"}
            </OwnerStatusChip>
            <OwnerStatusChip tone={supabaseBootstrap.configured ? "legacy" : "ink"}>
              Full Supabase legacy {supabaseBootstrap.configured ? "hazir" : "ayrik"}
            </OwnerStatusChip>
            {createStoreDisabled ? <OwnerStatusChip tone="warning">Preview submit kapali</OwnerStatusChip> : null}
          </>
        }
        panelTitle="Kurulum sirasi"
        panelItems={[
          { label: "1. Marka", value: "Magaza bilgileri" },
          { label: "2. Domain", value: "Yayin kimligi" },
          { label: "3. Tema", value: "Sektor dili" },
          { label: "4. Admin", value: "Baslangic erisimi" },
          { label: "5. Ticaret", value: "Odeme ve kargo" },
          { label: "6. Sistem", value: "Yeni standart" },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">Wizard mode</span>
            <span className="hero-chip hero-chip-neutral">Write guard korunur</span>
          </>
        }
      />

      <div className="owner-wizard-shell">
        <aside className="owner-wizard-rail">
          <div className="owner-action-panel tone-accent">
            <div>
              <div className="card-title">Wizard kontrolu</div>
              <p className="section-copy">
                Teknik database mode ana secim olmaktan cikarildi; yeni standart varsayilan,
                legacy akisi ise Advanced alaninda tutulur.
              </p>
            </div>
            <OwnerLifecycleStepper
              steps={[
                { label: "Magaza bilgileri", detail: "Ad, slug ve marka dili", state: "current" },
                { label: "Domain", detail: "Storefront ve admin kimligi", state: "pending" },
                { label: "Tema / sektor", detail: "Ilk tasarim sablonu", state: "pending" },
                { label: "Admin kullanici", detail: "Baslangic erisimi", state: "pending" },
                { label: "Odeme / kargo", detail: "Baslangic ticaret ayarlari", state: "pending" },
                { label: "Yeni sistem kurulumu", detail: "Light Postgres + R2 + placeholders", state: "pending" },
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
