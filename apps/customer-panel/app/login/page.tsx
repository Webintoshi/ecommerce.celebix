import Link from "next/link";
import { headers } from "next/headers";

import { resolveDefaultServerAdminHostAuthRuntime } from "../../lib/server-admin-host-auth/default.ts";
import { resolveTenantAdminLoginModel } from "../../lib/tenant-admin-login-model.ts";

export default async function LoginPage() {
  const requestHeaders = await headers();
  const model = await resolveTenantAdminLoginModel({
    hostHeader: requestHeaders.get("host"),
    resolveRuntime: resolveDefaultServerAdminHostAuthRuntime,
    clock: () => new Date(),
  });
  const initial = model.displayName.trim().charAt(0).toLocaleUpperCase("tr-TR") || "C";
  return (
    <main className="tenant-login-page" style={{ "--tenant-accent": model.accentColor } as React.CSSProperties}>
      <section className="tenant-login-story" aria-label={`${model.displayName} yönetim paneli`}>
        <div className="tenant-login-brand">
          {model.logoUrl ? <img src={model.logoUrl} alt={`${model.displayName} logosu`} /> : <span>{initial}</span>}
          <strong>{model.displayName}</strong>
          <small>Yönetim Paneli</small>
        </div>
        <div className="tenant-login-visual" aria-hidden="true">
          <div className="tenant-login-window">
            <div className="tenant-login-windowbar"><i /><i /><i /></div>
            <div className="tenant-login-dashboard">
              <span className="tenant-login-dashboard-mark">{initial}</span>
              <div><b /><b /><b /></div>
              <em>Mağazan hazır</em>
            </div>
          </div>
        </div>
        <div className="tenant-login-copy">
          <span>Tek panel. Tam kontrol.</span>
          <h1>{model.displayName}<br />Yönetim Paneli</h1>
          <p>Mağazanızı, siparişlerinizi ve ürünlerinizi güvenli yönetim alanından kontrol edin.</p>
        </div>
        <div className="tenant-login-trust"><span>✓</span> Güvenli, mağazaya özel erişim</div>
      </section>
      <section className="tenant-login-action">
        <div className="tenant-login-form">
          <img className="tenant-login-celebix" src="/Logo/celebix-koyu-logo.svg" alt="Celebix" />
          <div className="tenant-login-heading">
            <span>{model.kind === "tenant" ? model.displayName : "Celebix Panel"}</span>
            <h2>Yönetici girişi</h2>
            <p>Devam etmek için yönetici hesabınızla güvenli giriş yapın.</p>
          </div>
          <Link className="tenant-login-button" href={model.loginHref} prefetch={false}>
            Güvenli giriş yap <span aria-hidden="true">→</span>
          </Link>
          <Link className="tenant-login-secondary" href="https://ecommerce.celebix.co/kayit">Yeni mağaza oluştur</Link>
          <div className="tenant-login-divider" />
          <p className="tenant-login-protection"><span>♢</span> Celebix altyapısıyla korunuyor</p>
        </div>
      </section>
    </main>
  );
}
