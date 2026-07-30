export function SelfServeRegistrationPromo() {
  return (
    <aside className="self-serve-register-promo" aria-labelledby="self-serve-register-promo-title">
      <div className="self-serve-register-promo-media">
        <img
          src="/media/signup-customer-experience.jpg"
          alt="Mağazasını Celebix ile yöneten girişimci"
          width="1120"
          height="1400"
        />
      </div>

      <div className="self-serve-register-promo-copy">
        <h2 id="self-serve-register-promo-title">Fikrini mağazaya dönüştür.</h2>
        <p>Celebix ile teknik bilgiye ihtiyaç duymadan mağazanı oluştur, ürünlerini ekle ve ilk satışına hazırlan.</p>
        <span className="self-serve-register-promo-proof">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.4v5l3.2 2" />
          </svg>
          Dakikalar içinde hazır
        </span>
      </div>
    </aside>
  );
}
