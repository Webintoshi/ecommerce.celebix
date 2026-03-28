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
        <img
          src="https://celebix.co/Logo/koyu%20logo.svg"
          alt="Celebix"
          className="logo-img logo-img-lg"
          style={{ marginBottom: 20 }}
        />
        <h1 style={{ margin: "0 0 10px", fontSize: 32, fontWeight: 700 }}>
          Owner Panel
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: 320 }}>
          Tum e-ticaret projelerini tek panelden yonet.
        </p>
      </section>

      <section className="auth-panel">
        <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>
          Giris yap
        </h2>
        <OwnerAuthForm />
        {params.error === "missing_confirmation_token" ? (
          <p className="form-error" style={{ marginTop: 12 }}>
            Onay linki eksik veya bozuk geldi.
          </p>
        ) : null}
        {params.error === "confirmation_failed" ? (
          <p className="form-error" style={{ marginTop: 12 }}>
            E-posta onayi tamamlanamadi. Linki tekrar dene.
          </p>
        ) : null}
      </section>
    </main>
  );
}
