import Link from "next/link";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";

interface MagazaAcPageProps {
  searchParams: Promise<{ auth?: string; signup?: string; returnTo?: string }>;
}

export default async function MagazaAcPage({ searchParams }: MagazaAcPageProps) {
  const flags = getSelfServeFeatureFlags();
  const params = await searchParams;
  const authNotConfigured = params.auth === "logto_not_configured";
  const signupDisabled = params.signup === "disabled" || !flags.signupEnabled;

  return (
    <main className="self-serve-public-page">
      <section className="self-serve-landing">
        <div className="self-serve-landing-copy">
          <img src="/branding/celebix-logo.svg" alt="Celebix" className="self-serve-logo" />
          <span className="pill pill-accent">Kontrollu self-serve MVP</span>
          <h1>Magazanizi Celebix ekibiyle guvenli sekilde acin.</h1>
          <p>
            Basvurunuzu Logto oturumu ile alin, ihtiyaclarinizi toplayalim ve owner onayi olmadan
            hicbir production provisioning baslatmayalim.
          </p>
          <div className="self-serve-landing-actions">
            {signupDisabled ? (
              <button className="button button-primary" type="button" disabled>
                Basvuru su anda kapali
              </button>
            ) : (
              <Link className="button button-primary" href="/api/self-serve/auth/start?returnTo=/onboarding">
                Logto ile basla
              </Link>
            )}
            <Link className="button button-secondary" href="/onboarding/status">
              Basvuru durumunu gor
            </Link>
          </div>
          {authNotConfigured ? (
            <p className="self-serve-warning">
              Logto start URL/client ayari bulunamadi. Supabase Auth fallback yok; self-serve auth yalnizca Logto ile calisir.
            </p>
          ) : null}
        </div>

        <div className="self-serve-landing-panel" aria-label="Self-serve guvenlik ozeti">
          <div className="self-serve-panel-row">
            <span>Owner approval</span>
            <strong>{flags.requireOwnerApproval ? "Zorunlu" : "Kapali"}</strong>
          </div>
          <div className="self-serve-panel-row">
            <span>Store create</span>
            <strong>{flags.storeCreateEnabled ? "Acik" : "Kapali"}</strong>
          </div>
          <div className="self-serve-panel-row">
            <span>Provisioning</span>
            <strong>{flags.provisioningEnabled ? "Acik" : "Kapali"}</strong>
          </div>
          <div className="self-serve-panel-row">
            <span>Runtime cutover</span>
            <strong>Yok</strong>
          </div>
        </div>
      </section>

      <section className="self-serve-public-grid">
        <div className="self-serve-card">
          <span className="self-serve-card-index">01</span>
          <h2>Kayit ve basvuru</h2>
          <p>Basvuran kisi, isletme ve magaza bilgileri toplanir. E-posta oturumdan gelirse otomatik doldurulur.</p>
        </div>
        <div className="self-serve-card">
          <span className="self-serve-card-index">02</span>
          <h2>Owner kontrolu</h2>
          <p>Basvuru Owner Control Center icinde bekleyen onay olarak gorunur. Onay UI bu fazda safe-only kalir.</p>
        </div>
        <div className="self-serve-card">
          <span className="self-serve-card-index">03</span>
          <h2>Provisioning kapali</h2>
          <p>Coolify, DNS, R2, DB ve Logto client olusturma otomasyonu bu PR'da calismaz.</p>
        </div>
      </section>
    </main>
  );
}
