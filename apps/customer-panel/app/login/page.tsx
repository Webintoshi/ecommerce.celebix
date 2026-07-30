import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <span className="auth-brand">Celebix Panel</span>
        <h1>Mağazanızı yönetin</h1>
        <p>Doğrulanmış mağaza hesabınızla güvenli şekilde devam edin.</p>
        <Link className="primary-action" href="/auth/login" prefetch={false}>Girişe devam et</Link>
        <Link className="secondary-link" href="https://ecommerce.celebix.co/kayit">Kayıt sayfasına dön</Link>
      </section>
    </main>
  );
}
