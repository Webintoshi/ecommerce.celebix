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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg-soft)"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "40px 32px",
          boxShadow: "var(--shadow-md)"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img
            src="https://celebix.co/Logo/koyu%20logo.svg"
            alt="Celebix"
            style={{ height: 52, margin: "0 auto 16px" }}
          />
          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Owner Panel</h1>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
            Tum e-ticaret projelerini tek panelden yonet.
          </p>
        </div>

        <OwnerAuthForm />

        {params.error === "missing_confirmation_token" ? (
          <p className="form-error" style={{ marginTop: 14, fontSize: 14 }}>
            Onay linki eksik veya bozuk geldi.
          </p>
        ) : null}
        {params.error === "confirmation_failed" ? (
          <p className="form-error" style={{ marginTop: 14, fontSize: 14 }}>
            E-posta onayi tamamlanamadi. Linki tekrar dene.
          </p>
        ) : null}
      </div>
    </main>
  );
}
