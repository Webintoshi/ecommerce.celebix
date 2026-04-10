import { CreateStoreForm } from "@/components/CreateStoreForm";
import { requireOwnerAuth, requireSuperAdmin } from "@/lib/owner-auth";
import { getSupabaseBootstrapStatus } from "@/lib/supabase-bootstrap";

export default async function NewStorePage() {
  requireSuperAdmin(await requireOwnerAuth("/stores/new"));
  const supabaseBootstrap = await getSupabaseBootstrapStatus();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Yeni Proje Olustur</h1>
          <p>
            Yeni magaza kaydi, config dosyalari ve env sablonu olusturulur. Domain alani storefront ve admin icindir;
            self-hosted Supabase stock-host ile ayrica uretilir.
            {supabaseBootstrap.configured
              ? ` ${supabaseBootstrap.provider === "self_hosted_coolify" ? "Self-hosted Supabase" : "Supabase"} baglantisi hazir oldugu icin veritabani kurulur, admin env hazirlanir ve admin deployment otomasyonu denenir.`
              : " Supabase bootstrap ortam degiskenleri eksikse sadece dosya kaydi olusur."}
          </p>
        </div>
      </div>

      <div className="card card-cap">
        <CreateStoreForm />
      </div>
    </>
  );
}
