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
      <section className="auth-panel">
        <span className="eyebrow">Celebix Owner</span>
        <h1 className="title auth-title">Owner panel girisi</h1>
        <p className="muted">
          Ilk kaydolan owner hesabi otomatik super admin olur. Sonraki kullanicilar affiliate veya ekip hesabi olarak
          atanir.
        </p>
        {params.error === "missing_confirmation_token" ? (
          <p className="form-error">Onay linki eksik veya bozuk geldi.</p>
        ) : null}
        {params.error === "confirmation_failed" ? (
          <p className="form-error">E-posta onayi tamamlanamadi. Linki tekrar dene.</p>
        ) : null}
      </section>

      <section className="auth-panel">
        <OwnerAuthForm />
      </section>
    </main>
  );
}
