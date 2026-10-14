import Link from "next/link";
import { CirclePlus, Store } from "lucide-react";

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
              <span className={styles.glyph} aria-hidden="true"><Store size={32} strokeWidth={1.5} /><CirclePlus className={styles.addMark} size={14} strokeWidth={1.5} /></span>
              <span>Yeni mağaza aç</span>
            </Link>
            <Link className={styles.action} data-login-action="branch" href="https://ecommerce.celebix.co/kayit" prefetch={false}>
              <svg className={styles.glyph} aria-hidden="true" width="32" height="32" viewBox="0 0 40 36" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 2v5M9 12V7h22v5" />
                {[0, 22].map(x => <g key={x} transform={`translate(${x} 0)`}><path d="m2 21 2-7h10l2 7M3 24v9h12v-9M7 33v-6h4v6" /><path d="M2 21a2.3 2.3 0 0 0 4.6 0 2.3 2.3 0 0 0 4.8 0 2.3 2.3 0 0 0 4.6 0M7 14l-.4 7M11 14l.4 7" /></g>)}
              </svg>
              <span>Şube ekle</span>
            </Link>
          </nav>
        </div>
      </section>

      <div className="tenant-login-artwork" aria-hidden="true">
        <img
          className="tenant-login-illustration"
          src="/illustrations/login-helper-960.webp"
          srcSet="/illustrations/login-helper-480.webp 480w, /illustrations/login-helper-960.webp 960w, /illustrations/login-helper-1393.webp 1393w"
          sizes="(max-width: 760px) 100vw, calc(56vw + 128px)"
          width={1393}
          height={1129}
          alt=""
          decoding="async"
        />
      </div>
    </main>
  );
}
