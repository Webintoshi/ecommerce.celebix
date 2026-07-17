import Link from "next/link";

export default function PanelHomePage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <h1>Genel bakış</h1>
        <p>Ürün kataloğunuzu kalıcı mağaza yetkinizle güvenli biçimde yönetin.</p>
      </div>
      <div className="notice-panel">
        <span className="eyebrow">KATALOG YÖNETİMİ</span>
        <h2>Ürün konsolu hazır</h2>
        <p>Ürün oluşturun, fiyat ve stok bilgilerini yönetin, varyantları güvenli sürüm denetimiyle güncelleyin.</p>
        <Link className="button button-primary" href="/products">Ürünlere git →</Link>
      </div>
    </section>
  );
}
