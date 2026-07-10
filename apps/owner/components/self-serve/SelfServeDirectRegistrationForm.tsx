interface SelfServeDirectRegistrationFormProps {
  enabled: boolean;
  domainSuffix?: string;
}

export function SelfServeDirectRegistrationForm({
  enabled,
  domainSuffix = "celebix.site",
}: SelfServeDirectRegistrationFormProps) {
  return (
    <form
      className="self-serve-direct-form"
      action="/api/self-serve/register"
      method="post"
      aria-describedby="self-serve-registration-state"
    >
      <label>
        <span>Mağaza adı</span>
        <input
          name="storeName"
          autoComplete="organization"
          placeholder="Örnek Mağaza"
          required
          maxLength={120}
        />
      </label>

      <label>
        <span>Mağaza adresi</span>
        <div className="self-serve-slug-field">
          <input
            name="storeSlug"
            autoComplete="off"
            placeholder="ornek-magaza"
            required
            minLength={3}
            maxLength={48}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          />
          <b>.{domainSuffix}</b>
        </div>
      </label>

      <div className="self-serve-consent-stack">
        <label className="self-serve-direct-consent">
          <input name="marketingConsent" type="checkbox" value="true" />
          <span>Fırsatlar ve bilgilendirmeler için ticari elektronik ileti almak istiyorum. (Opsiyonel)</span>
        </label>
        <label className="self-serve-direct-consent">
          <input name="privacyConsent" type="checkbox" value="true" required />
          <span>KVKK, gizlilik ve açık rıza metinlerini okudum; mağaza kaydı için kabul ediyorum.</span>
        </label>
      </div>

      <button
        className="button button-primary self-serve-direct-submit"
        type="submit"
        disabled={!enabled}
        aria-disabled={!enabled}
      >
        Kimliğimi doğrula ve mağazamı kur
      </button>
    </form>
  );
}
