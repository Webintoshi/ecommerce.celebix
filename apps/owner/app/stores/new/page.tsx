import {
  getDefaultAdminDeploymentBranch,
  getStorefrontDeploymentBranchPrefix,
} from "@/lib/platform-config-owner";
import { CreateStoreForm } from "@/components/CreateStoreForm";
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
      <div className="page-header">
        <div>
          <h1>Yeni Proje Olustur</h1>
          <p>
            Yeni magaza kaydi, authority dosyalari ve env sablonu olusturulur. Varsayilan akista
            storefront/admin domainleri ile birlikte demo domain authority&apos;si de hazirlanir.
            {lightPostgresBootstrap.configured
              ? ` Light Postgres authority hazir oldugu icin yeni standard store-per-database modeli hedeflenir.`
              : " Light Postgres bootstrap authority eksikse yeni store create preflight'ta bloklanir; owner env tamamlanmadan canli create baslatilmaz."}
            {supabaseBootstrap.configured
              ? ` Full Supabase sadece explicit legacy mode secildiginde devreye girer.`
              : " Full Supabase bootstrap authority ayrica legacy mod icin ayrik tutulur."}
          </p>
        </div>
      </div>

      <div className="card card-cap">
        <CreateStoreForm
          ownerDeploymentBranch={getDefaultAdminDeploymentBranch()}
          storefrontBranchPrefix={getStorefrontDeploymentBranchPrefix()}
          disabled={createStoreDisabled}
          disabledReason={createStoreDisabledReason}
        />
      </div>
    </>
  );
}
