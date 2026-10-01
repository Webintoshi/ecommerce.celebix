import Link from "next/link";
import type { ReactNode } from "react";
import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";
import { resolveAccountAuthBranding } from "./account-auth-branding.ts";
import styles from "./account-auth.module.css";

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

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;500;600&display=swap" />
      <main className={styles.shell} aria-label={title}>
        <header className={styles.brand}>
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
              "Mağaza"
            )}
          </Link>
          <Link className={styles.backLink} href="/" aria-label="Mağazaya dön">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
            <span className={styles.backText}>Mağazaya dön</span>
          </Link>
        </header>
        <section className={styles.panel}>
          <div className={styles.panelInner}>{children}</div>
        </section>
      </main>
    </>
  );
}
