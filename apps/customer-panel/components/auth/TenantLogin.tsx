import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

import type { TenantAdminLoginModel } from "../../lib/tenant-admin-login-model.ts";

export function TenantLogin({ model }: Readonly<{ model: TenantAdminLoginModel }>) {
  const initial = model.displayName.trim().charAt(0).toLocaleUpperCase("tr-TR") || "C";

  return (
    <main className="tenant-login-page">
      <header className="tenant-login-header">
        <img src="/Logo/celebix-koyu-logo.svg" width={200} height={88} alt="Celebix" />
      </header>

      <section className="tenant-login-entry" aria-labelledby="tenant-login-name">
        <div className="tenant-login-content">
          <div className="tenant-login-identity">
            <div className="tenant-login-mark" aria-hidden="true">
              <span>{initial}</span>
              {model.logoUrl ? <img src={model.logoUrl} width={80} height={80} alt="" /> : null}
            </div>
            <h1 id="tenant-login-name">{model.displayName}</h1>
            <p>Yönetim paneli</p>
          </div>

          <div className="tenant-login-actions">
            <Link className="tenant-login-button" href={model.loginHref} prefetch={false}>
              Güvenli giriş yap <ArrowRight size={20} aria-hidden="true" />
            </Link>
            <Link className="tenant-login-secondary" href="https://ecommerce.celebix.co/kayit" prefetch={false}>
              Yeni mağaza oluştur
            </Link>
          </div>

          <p className="tenant-login-trust">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>Güvenli, mağazaya özel erişim</span>
          </p>
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
