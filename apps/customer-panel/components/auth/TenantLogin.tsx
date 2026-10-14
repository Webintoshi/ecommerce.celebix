import Link from "next/link";
import { ChartNoAxesColumnIncreasing, Clock3, ShieldCheck, Store } from "lucide-react";

import { MerchantPhoneLoginForm } from "./MerchantPhoneLoginForm.tsx";
import styles from "./TenantLogin.module.css";

import type { TenantAdminLoginModel } from "../../lib/tenant-admin-login-model.ts";

export function TenantLogin({ model }: Readonly<{ model: TenantAdminLoginModel }>) {
  return (
    <main className={`tenant-login-page ${styles.page}`}>
      <header className={`tenant-login-header ${styles.header}`}>
        <img src="/Logo/celebix-koyu-logo.svg" width={200} height={88} alt="Celebix" />
        <h1 id="tenant-login-name">{model.displayName}</h1>
      </header>

      <section className={`tenant-login-entry ${styles.entry}`} aria-labelledby="tenant-login-name">
        <div className={`tenant-login-content ${styles.content}`}>
          <MerchantPhoneLoginForm inline />
          <nav className={styles.actions} aria-label="Mağaza açılışı">
            <Link className={styles.action} data-login-action="store" href="https://ecommerce.celebix.co/kayit" prefetch={false}>
              <Store className={styles.glyph} aria-hidden="true" size={40} strokeWidth={1.5} />
              <span className={styles.actionCopy}><span className={styles.actionTitle}>Yeni mağaza aç</span><span className={styles.actionDescription}>Kendi mağazanı dakikalar içinde aç.</span></span>
            </Link>
            <Link className={styles.action} data-login-action="branch" href="https://ecommerce.celebix.co/kayit" prefetch={false}>
              <svg className={styles.glyph} aria-hidden="true" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 10V5h26v5M4 18l3-8h26l3 8M6 22v13h28V22M16 35V25h8v10M13 10l-1 8M20 10v8M27 10l1 8" />
                <path d="M4 18a4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0M10 27h2M28 27h2" />
              </svg>
              <span className={styles.actionCopy}><span className={styles.actionTitle}>Şube ekle</span><span className={styles.actionDescription}>Mevcut mağazana şube ekle.</span></span>
            </Link>
          </nav>
        </div>
      </section>

      <aside className={styles.presentation} aria-label="Celebix ile mağaza yönetimi">
        <span className={styles.language} lang="tr">Türkçe</span>
        <div className={styles.statement}>
          <svg width="40" height="8" viewBox="0 0 40 8" fill="none" aria-hidden="true"><path d="M2 4h36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <h2>İşinizi kolaylaştıran<br /> teknoloji.</h2>
        </div>
        <div className={`tenant-login-artwork ${styles.artwork}`}>
          <img
            className={`tenant-login-illustration ${styles.illustration}`}
            src="/illustrations/login-mascot-premium-960.webp"
            srcSet="/illustrations/login-mascot-premium-640.webp 640w, /illustrations/login-mascot-premium-960.webp 960w, /illustrations/login-mascot-premium-1448.webp 1448w"
            sizes="(max-width: 760px) 100vw, 52vw"
            width={1448}
            height={1086}
            alt=""
            decoding="async"
          />
        </div>
        <ul className={styles.benefits}>
          <li><ChartNoAxesColumnIncreasing size={28} strokeWidth={1.5} aria-hidden="true" /><span><strong>Mağazanızı yönetin</strong><span>Ürün, stok ve siparişler tek panelde</span></span></li>
          <li><Clock3 size={28} strokeWidth={1.5} aria-hidden="true" /><span><strong>Zamandan tasarruf edin</strong><span>Daha verimli, daha güçlü bir yönetim</span></span></li>
          <li><ShieldCheck size={28} strokeWidth={1.5} aria-hidden="true" /><span><strong>Güvenle büyüyün</strong><span>Sizin başarınız, bizim önceliğimiz</span></span></li>
        </ul>
      </aside>
      <nav className={styles.footer} aria-label="Celebix bağlantıları">
          <a href="https://celebix.net/tr/gizlilik">Gizlilik</a>
          <a href="https://celebix.net/tr/kullanim-kosullari">Kullanım Şartları</a>
          <a href="https://celebix.net/tr/iletisim">Destek</a>
      </nav>
    </main>
  );
}
