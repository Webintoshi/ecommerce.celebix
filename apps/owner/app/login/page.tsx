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
        background: "var(--gray-50)"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--white)",
          border: "1px solid var(--gray-200)",
          borderRadius: "20px",
          padding: "48px 40px",
          boxShadow: "0 10px 40px -10px rgba(43, 43, 43, 0.1)"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 64,
            height: 64,
            background: "var(--gray-800)",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px"
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EB651E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          <h1 style={{ 
            margin: "0 0 8px", 
            fontSize: 24, 
            fontWeight: 800,
            color: "var(--gray-800)",
            letterSpacing: "-0.02em"
          }}>
            Celebix Owner
          </h1>
          <p style={{ 
            margin: 0, 
            fontSize: 14, 
            fontWeight: 500,
            color: "var(--gray-500)"
          }}>
            Tum e-ticaret projelerini tek panelden yonet
          </p>
        </div>

        <OwnerAuthForm />

        {params.error === "missing_confirmation_token" ? (
          <p style={{ 
            marginTop: 16, 
            fontSize: 13, 
            fontWeight: 600,
            color: "var(--error)",
            textAlign: "center"
          }}>
            Onay linki eksik veya bozuk geldi.
          </p>
        ) : null}
        {params.error === "confirmation_failed" ? (
          <p style={{ 
            marginTop: 16, 
            fontSize: 13, 
            fontWeight: 600,
            color: "var(--error)",
            textAlign: "center"
          }}>
            E-posta onayi tamamlanamadi. Linki tekrar dene.
          </p>
        ) : null}
      </div>
    </main>
  );
}
