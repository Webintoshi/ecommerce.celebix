import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";

import { resolveAccountAuthBranding } from "./account-auth-branding.ts";
import styles from "./account-auth.module.css";

type AccountAuthStyle = CSSProperties &
  Readonly<{
    "--store-primary": string;
    "--store-accent": string;
    "--store-background": string;
    "--store-text": string;
  }>;

export function AccountAuthShell({
  storefront,
  design,
  title,
  children,
}: Readonly<{
  storefront: PublicStorefront;
  design: PublicStorefrontDesign;
  title: string;
  children: ReactNode;
}>) {
  const branding = resolveAccountAuthBranding(storefront, design);
  const customized = branding.publicationVersion > 1;
  const style: AccountAuthStyle = {
    "--store-primary": branding.primaryColor,
    "--store-accent": branding.accentColor,
    "--store-background": branding.backgroundColor,
    "--store-text": branding.textColor,
  };

  return (
    <main
      className={`starter-storefront celebix-store-design ${branding.themeClasses} ${styles.shell}`}
      data-published-design={customized ? "true" : "false"}
      data-font={customized ? branding.fontFamily : undefined}
      style={style}
    >
      <section className={styles.brand} aria-label={branding.displayName}>
        <Link
          className={styles.wordmark}
          href="/"
          aria-label={`${branding.displayName} ana sayfa`}
        >
          {branding.logo ? (
            <img
              src={branding.logo.url}
              alt={branding.logo.altText}
              width={branding.logo.width}
              height={branding.logo.height}
            />
          ) : (
            branding.displayName
          )}
        </Link>
        <div className={styles.brandMessage}>
          <p>Giriş Yap &amp; Hesap Oluştur</p>
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelInner}>
          <h1 className={styles.visuallyHidden}>{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
