import process from "node:process";

import { resolveSelfServeRegistrationUiEnabled } from "@/lib/self-serve-registration-orchestrator";
import { SelfServeDirectRegistrationForm } from "@/components/self-serve/SelfServeDirectRegistrationForm";
import Link from "next/link";

export default function KayitPage() {
  const registrationEnabled = resolveSelfServeRegistrationUiEnabled(process.env);
  const registrationState = registrationEnabled ? "enabled" : "disabled";

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
        <p>Mağazanızı oluşturun; ödeme ve kargo ayarlarınızı panelinizden tamamlayın.</p>
      </section>

      <section className="self-serve-register-form-wrap" aria-label="Mağaza kayıt durumu" data-state={registrationState}>
        <SelfServeDirectRegistrationForm
          enabled={registrationEnabled}
          domainSuffix={registrationEnabled ? process.env.CELEBIX_PLATFORM_DOMAIN_SUFFIX : undefined}
        />
        <section className="self-serve-register-disabled">
          {registrationEnabled ? (
            <>
              <h2 id="self-serve-registration-state">Kimliğinizi doğrulayın, mağazanızı oluşturun.</h2>
              <p>
                Hesap doğrulamasından sonra mağazanız otomatik oluşturulur ve yönetim panelinize yönlendirilirsiniz.
              </p>
            </>
          ) : (
            <>
              <h2 id="self-serve-registration-state">Kayıt altyapısı hazırlanıyor.</h2>
              <p>
                Mağaza kaydı şu anda kullanılamıyor. Kayıt açıldığında kimliğinizi doğrulayarak mağazanızı oluşturabilirsiniz.
              </p>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
