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
          <h1>Yeni proje olustur</h1>
          <p>
            Yeni magaza kaydi, config dosyalari ve env sablonu olusturulur.
            {supabaseBootstrap.configured
              ? ` ${supabaseBootstrap.provider === "self_hosted_coolify" ? "Self-hosted Supabase" : "Supabase"} baglantisi hazir oldugu icin veritabani da otomatik kurulur.`
              : " Supabase bootstrap ortam degiskenleri eksikse sadece dosya kaydi olusur."}
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <CreateStoreForm />
      </div>
    </>
  );
}
