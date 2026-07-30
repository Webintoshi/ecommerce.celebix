export function SelfServeRegistrationPromo() {
  return (
    <aside className="self-serve-register-promo" aria-labelledby="self-serve-register-promo-title">
      <div className="self-serve-register-promo-media" aria-hidden="true">
        <img src="/media/signup-storefront-promo-poster.webp" alt="" />
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/media/signup-storefront-promo-poster.webp"
          tabIndex={-1}
        >
          <source src="/media/signup-storefront-promo.webm" type="video/webm" />
          <source src="/media/signup-storefront-promo.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="self-serve-register-promo-copy">
        <h2 id="self-serve-register-promo-title">Ücretsiz mağazanı bugün aç</h2>
        <p>Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla.</p>
      </div>
    </aside>
  );
}
