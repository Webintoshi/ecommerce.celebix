import { SELF_SERVE_SAAS_REGISTRATION_ENABLED } from "@/lib/self-serve-registration-orchestrator";
import { SelfServeDirectRegistrationForm } from "@/components/self-serve/SelfServeDirectRegistrationForm";
import Link from "next/link";

export default function KayitPage() {
  const registrationState = SELF_SERVE_SAAS_REGISTRATION_ENABLED ? "integration_required" : "disabled";

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
        <p>Sanal POS, kargo ve yönetim paneliniz hazır.</p>
      </section>

      <section className="self-serve-register-form-wrap" aria-label="Mağaza kayıt durumu" data-state={registrationState}>
        <SelfServeDirectRegistrationForm enabled={SELF_SERVE_SAAS_REGISTRATION_ENABLED} />
        <section className="self-serve-register-disabled">
          <h2 id="self-serve-registration-state">Kayıt altyapısı hazırlanıyor.</h2>
          <p>
            Bu güvenli temel henüz canlı mağaza oluşturmaz. Kimlik doğrulama ve mağaza kurulumu açık bir
            entegrasyon onayından sonra etkinleştirilecektir.
          </p>
        </section>
      </section>
    </main>
  );
}
