import { redirect } from "next/navigation";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { OwnerAuthForm } from "@/components/OwnerAuthForm";
import { getOwnerAuthContext } from "@/lib/owner-auth";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const auth = await getOwnerAuthContext();
  const params = await searchParams;

  if (auth) {
    redirect(sanitizeInternalRedirectPath(params.next, "/"));
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-label="Owner panel giris">
        <div className="login-brand">
          <div className="login-badge" aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          <h1 className="login-heading">Celebix Owner</h1>
          <p className="login-subtitle">Tum e-ticaret projelerini tek panelden yonet</p>
        </div>

        <OwnerAuthForm />

        {params.error === "missing_confirmation_token" ? (
          <p className="login-message is-error">Onay linki eksik veya bozuk geldi.</p>
        ) : null}
        {params.error === "confirmation_failed" ? (
          <p className="login-message is-error">E-posta onayi tamamlanamadi. Linki tekrar dene.</p>
        ) : null}
      </section>
    </main>
  );
}
