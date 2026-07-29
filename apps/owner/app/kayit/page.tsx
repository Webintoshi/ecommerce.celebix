import { SelfServeDirectRegistrationForm } from "@/components/self-serve/SelfServeDirectRegistrationForm";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import Link from "next/link";

export default function KayitPage() {
  const flags = getSelfServeFeatureFlags();
  const signupDisabled = !flags.signupEnabled || !flags.directRegistrationEnabled;

  return (
    <main className="self-serve-public-page self-serve-register-page">
      <div className="self-serve-register-shell">
        <section className="self-serve-register-main">
          <header className="self-serve-register-header">
            <img src="/branding/celebix-logo.svg" alt="Celebix" className="self-serve-logo" />
            <Link className="self-serve-register-login" href="/login">
              Zaten hesabınız var mı? <strong>Giriş Yap</strong>
            </Link>
          </header>

          <section className="self-serve-register-hero" aria-labelledby="self-serve-register-title">
            <h1 id="self-serve-register-title">E-Ticaret sitenizi açın!</h1>
            <p>Sanal POS, kargo ve yönetim paneliniz hazır.</p>
          </section>

          <section className="self-serve-register-form-wrap" aria-label="Mağaza kayıt formu">
            {signupDisabled ? (
              <section className="self-serve-register-disabled">
                <h2>Kayıt şu anda kapalı.</h2>
                <p>
                  Mağaza kayıtları yeniden açıldığında bu ekrandan ücretsiz mağaza kurulumunuzu başlatabilirsiniz.
                </p>
              </section>
            ) : (
              <SelfServeDirectRegistrationForm flags={flags} />
            )}
          </section>
        </section>

        <aside className="self-serve-register-promo" aria-labelledby="self-serve-register-promo-title">
          <span className="self-serve-register-promo-badge">
            Celebix <i /> KOBİ&apos;lerin yanında
          </span>

          <div className="self-serve-register-visual" aria-hidden="true">
            <span className="self-serve-register-visual-orbit" />
            <div className="self-serve-register-store-card">
              <span className="self-serve-register-store-mark">C</span>
              <span className="self-serve-register-store-line is-wide" />
              <span className="self-serve-register-store-line" />
              <span className="self-serve-register-store-action">Mağazan hazır</span>
            </div>
          </div>

          <div className="self-serve-register-promo-copy">
            <p>Ücretsiz</p>
            <h2 id="self-serve-register-promo-title">E-Ticaret Yolculuğunu Başlat</h2>
            <span>Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
