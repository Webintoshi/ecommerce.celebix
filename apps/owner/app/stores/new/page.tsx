import Link from "next/link";
import { CreateStoreForm } from "@/components/CreateStoreForm";
import { requireOwnerAuth, requireSuperAdmin } from "@/lib/owner-auth";
import { getSupabaseBootstrapStatus } from "@/lib/supabase-bootstrap";

export default async function NewStorePage() {
  requireSuperAdmin(await requireOwnerAuth("/stores/new"));
  const supabaseBootstrap = await getSupabaseBootstrapStatus();

  return (
    <main className="page-shell">
      <div className="actions" style={{ marginBottom: 24 }}>
        <Link className="button button-secondary" href="/">
          Owner paneline don
        </Link>
      </div>

      <section className="hero">
        <div className="panel">
          <span className="eyebrow">Yeni Proje</span>
          <h1 className="title">Yeni magaza ve proje kaydini owner panelden ac.</h1>
          <p className="muted">
            Bu form proje registry kaydini, store config dosyasini ve admin env sablonunu olusturur.
            {supabaseBootstrap.configured
              ? " Supabase token hazir oldugu icin store veritabani da arka planda kurulacak."
              : " Supabase token hazir degilse sadece dosya ve store kaydi olusur."}
          </p>
        </div>

        <div className="panel">
          <h2 className="section-title">Bu adimda olusanlar</h2>
          <div className="actions">
            <span className="pill">stores/registry.json</span>
            <span className="pill">store.config.json</span>
            <span className="pill">admin.env.example</span>
            <span className="pill">admin.env.local</span>
            <span className="pill">owner_stores kaydi</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Magaza Bilgileri</h2>
        <CreateStoreForm />
      </section>
    </main>
  );
}
