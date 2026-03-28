import Link from "next/link";
import { CreateStoreForm } from "@/components/CreateStoreForm";
import { requireOwnerAuth, requireSuperAdmin } from "@/lib/owner-auth";
import { getSupabaseBootstrapStatus } from "@/lib/supabase-bootstrap";

export default async function NewStorePage() {
  requireSuperAdmin(await requireOwnerAuth("/stores/new"));
  const supabaseBootstrap = await getSupabaseBootstrapStatus();

  return (
    <>
      <header className="nav-header">
        <Link href="/" className="logo-text">
          Celebi<span>x</span>
        </Link>
        <Link className="button button-ghost" href="/">
          Owner paneline don
        </Link>
      </header>

      <main className="page-shell">
        <div className="page-header">
          <span className="section-kicker">Yeni Proje</span>
          <h1 className="title">Yeni magaza ve proje kaydi ac.</h1>
          <p className="muted">
            Bu form proje registry kaydini, store config dosyasini ve admin env sablonunu olusturur.
            {supabaseBootstrap.configured
              ? " Supabase token hazir oldugu icin store veritabani da arka planda kurulacak."
              : " Supabase token hazir degilse sadece dosya ve store kaydi olusur."}
          </p>
        </div>

        <section className="hero">
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
    </>
  );
}
