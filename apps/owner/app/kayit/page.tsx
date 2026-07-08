import { SelfServeDirectRegistrationForm } from "@/components/self-serve/SelfServeDirectRegistrationForm";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import Link from "next/link";

export default function KayitPage() {
  const flags = getSelfServeFeatureFlags();
  const signupDisabled = !flags.signupEnabled || !flags.directRegistrationEnabled;

  return (
    <main className="self-serve-public-page self-serve-register-page">
      <header className="self-serve-register-header">
        <img src="/branding/celebix-logo.svg" alt="Celebix" className="self-serve-logo" />
        <Link className="self-serve-register-login" href="/login">
          Zaten hesabınız var mı? <strong>Giriş Yap</strong>
        </Link>
      </header>

      <section className="self-serve-register-hero" aria-labelledby="self-serve-register-title">
        <h1 id="self-serve-register-title">E-Ticaret sitenizi açın!</h1>
        <p>Sanal POS ve kargo anlaşmalarınız anında hazır.</p>
      </section>

      <section className="self-serve-register-form-wrap" aria-label="Mağaza kayıt formu">
        {signupDisabled ? (
          <section className="self-serve-register-disabled">
            <h2>Kayıt şu anda kapalı.</h2>
            <p>Mağaza kayıtları yeniden açıldığında bu ekrandan başvurunuzu alacağız.</p>
          </section>
        ) : (
          <SelfServeDirectRegistrationForm flags={flags} />
        )}
      </section>
    </main>
  );
}
