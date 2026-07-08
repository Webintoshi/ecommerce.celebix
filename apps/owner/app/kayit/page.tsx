import Link from "next/link";
import { headers } from "next/headers";
import { SelfServeOnboardingForm } from "@/components/self-serve/SelfServeOnboardingForm";
import { SelfServeStatusPanel } from "@/components/self-serve/SelfServeStatusPanel";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { readSelfServeSessionFromHeaders } from "@/lib/self-serve-logto";

interface KayitPageProps {
  searchParams: Promise<{ auth?: string; signup?: string; step?: string; id?: string }>;
}

export default async function KayitPage({ searchParams }: KayitPageProps) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()]);
  const flags = getSelfServeFeatureFlags();
  const applicantSession = readSelfServeSessionFromHeaders(requestHeaders);
  const signupDisabled = params.signup === "disabled" || !flags.signupEnabled;
  const authNotConfigured = params.auth === "logto_not_configured" || params.auth === "owner_public_url_not_configured";
  const showStatus = params.step === "status";
  const isAuthenticated = Boolean(applicantSession?.email);

  return (
    <main className="self-serve-public-page self-serve-kayit-page">
      <section className="self-serve-kayit-shell">
        <aside className="self-serve-kayit-hero">
          <img src="/branding/celebix-logo.svg" alt="Celebix" className="self-serve-logo" />
          <span className="pill pill-accent">Celebix self-serve</span>
          <h1>Magazani tek ekrandan acmaya basla.</h1>
          <p>
            Kisa basvurunu alalim, Celebix ekibi kurulumu guvenli sekilde kontrol etsin.
            Bu fazda gercek store create ve provisioning owner onayi olmadan calismaz.
          </p>

          <div className="self-serve-trust-list" aria-label="Celebix guven noktalar">
            <span>Komisyonsuz e-ticaret altyapisi</span>
            <span>Kurulum destegi</span>
            <span>Guvenli odeme ve yonetim paneli</span>
            <span>Celebix destegi</span>
          </div>

          <div className="self-serve-panel-row">
            <span>Store create</span>
            <strong>{flags.storeCreateEnabled ? "Acik" : "Kapali"}</strong>
          </div>
          <div className="self-serve-panel-row">
            <span>Provisioning</span>
            <strong>{flags.provisioningEnabled ? "Acik" : "Kapali"}</strong>
          </div>
        </aside>

        <section className="self-serve-kayit-main">
          {showStatus ? (
            <SelfServeStatusPanel requestId={params.id} />
          ) : signupDisabled ? (
            <section className="self-serve-card self-serve-card-center">
              <span className="pill pill-accent">Basvuru kapali</span>
              <h2>Self-serve kayit su anda aktif degil.</h2>
              <p>Bu bayrak kapaliyken kullanicilar yanlislikla magaza basvurusu olusturamaz.</p>
            </section>
          ) : isAuthenticated ? (
            <SelfServeOnboardingForm flags={flags} applicantSession={applicantSession} />
          ) : (
            <section className="self-serve-card self-serve-start-card">
              <span className="pill pill-accent">Hizli basvuru</span>
              <h2>Once Celebix hesabini olustur.</h2>
              <p>
                Logto ile giris veya kayit sonrasi bu sayfaya donup magaza bilgilerini ayni ekranda tamamlayacaksin.
              </p>
              <Link className="button button-primary" href="/api/self-serve/auth/start?returnTo=/kayit">
                Magazani olusturmaya basla
              </Link>
              <small>Supabase Auth fallback yoktur; self-serve basvuru yalnizca Logto ile baslar.</small>
              {authNotConfigured ? (
                <p className="self-serve-warning">
                  Logto client ayari eksik veya public URL guvenli degil. Basvuru guvenli sekilde durduruldu.
                </p>
              ) : null}
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
