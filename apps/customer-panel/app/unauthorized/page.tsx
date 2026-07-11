import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <span className="auth-brand">Celebix Panel</span>
        <h1>Bu mağazaya erişilemiyor</h1>
        <p>Etkin bir mağaza üyeliği bulunamadı veya seçili mağaza için yetkiniz kaldırılmış olabilir.</p>
        <Link className="primary-action" href="/login">Giriş ekranına dön</Link>
      </section>
    </main>
  );
}
