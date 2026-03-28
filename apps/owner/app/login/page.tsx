import { redirect } from "next/navigation";
import { OwnerAuthForm } from "@/components/OwnerAuthForm";
import { getOwnerAuthContext } from "@/lib/owner-auth";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const auth = await getOwnerAuthContext();
  const params = await searchParams;

  if (auth) {
    redirect(params.next || "/");
  }

  return (
    <main className="auth-shell">
      <section>
        <div className="logo-text" style={{ fontSize: 32, marginBottom: 24 }}>
          Celebi<span>x</span>
        </div>
        <span className="section-kicker">Owner Girisi</span>
        <h1 className="title auth-title" style={{ marginTop: 12 }}>
          Owner paneline giris yap
        </h1>
        <p className="muted" style={{ maxWidth: 420, marginTop: 12 }}>
          Ilk kaydolan owner hesabi otomatik super admin olur. Sonraki kullanicilar affiliate veya ekip hesabi olarak
          atanir.
        </p>
        {params.error === "missing_confirmation_token" ? (
          <p className="form-error" style={{ marginTop: 16 }}>
            Onay linki eksik veya bozuk geldi.
          </p>
        ) : null}
        {params.error === "confirmation_failed" ? (
          <p className="form-error" style={{ marginTop: 16 }}>
            E-posta onayi tamamlanamadi. Linki tekrar dene.
          </p>
        ) : null}
      </section>

      <section className="auth-panel">
        <OwnerAuthForm />
      </section>
    </main>
  );
}
