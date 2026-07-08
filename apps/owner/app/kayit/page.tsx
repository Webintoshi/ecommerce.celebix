import { SelfServeDirectRegistrationForm } from "@/components/self-serve/SelfServeDirectRegistrationForm";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";

export default function KayitPage() {
  const flags = getSelfServeFeatureFlags();
  const signupDisabled = !flags.signupEnabled || !flags.directRegistrationEnabled;

  return (
    <main className="self-serve-public-page self-serve-direct-page">
      <section className="self-serve-direct-shell">
        <aside className="self-serve-direct-copy">
          <img src="/branding/celebix-logo.svg" alt="Celebix" className="self-serve-logo" />
          <h1>E-Ticaret sitenizi açın!</h1>
          <p>
            Sanal POS, kargo ve yönetim paneliniz hazır olsun. Tek formdan hesabınızı ve
            mağaza kurulum talebinizi başlatın.
          </p>

          <div className="self-serve-trust-list" aria-label="Celebix guven noktalar">
            <span>Komisyonsuz e-ticaret altyapısı</span>
            <span>Kurulum desteği</span>
            <span>Güvenli ödeme ve yönetim paneli</span>
            <span>Celebix desteği</span>
          </div>

          <div className="self-serve-direct-note">
            <strong>Kurulum sonrası</strong>
            <span>
              Mağazanız hazır olduğunda yönetim paneliniz, ödeme ve kargo kurulum adımlarınız
              tek panelden takip edilebilir hale gelir.
            </span>
          </div>
        </aside>

        <section className="self-serve-direct-card">
          {signupDisabled ? (
            <section className="self-serve-card self-serve-card-center">
              <span className="pill pill-accent">Kayıt kapalı</span>
              <h2>Self-serve kayıt şu anda aktif değil.</h2>
              <p>Bu bayrak kapalıyken kullanıcılar yanlışlıkla mağaza kaydı başlatamaz.</p>
            </section>
          ) : (
            <SelfServeDirectRegistrationForm flags={flags} />
          )}
        </section>
      </section>
    </main>
  );
}
