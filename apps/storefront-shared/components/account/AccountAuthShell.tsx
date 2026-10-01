import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";
import { createStorefrontTypographyResources } from "@celebix/storefront-design-ui";

import { accountAuthButtonTextColor, resolveAccountAuthBranding } from "./account-auth-branding.ts";
import styles from "./account-auth.module.css";

type AccountAuthStyle = CSSProperties &
  Readonly<{
    "--store-primary": string;
    "--store-accent": string;
    "--store-background": string;
    "--store-text": string;
    "--auth-action-ink": string;
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
  const typography = createStorefrontTypographyResources(design.typography);
  const style: AccountAuthStyle = {
    ...typography.style,
    "--store-primary": branding.primaryColor,
    "--store-accent": branding.accentColor,
    "--store-background": branding.backgroundColor,
    "--store-text": branding.textColor,
    "--auth-action-ink": accountAuthButtonTextColor(branding.primaryColor),
  };

  return (
    <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link rel="stylesheet" href={typography.stylesheetUrl} />
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
        <span className={styles.brandCaption}>GÜVENLİ HESAP ERİŞİMİ</span>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelInner}>
          <h1 className={styles.visuallyHidden}>{title}</h1>
          {children}
        </div>
      </section>
      <p className={styles.shellFooter}>Güvenli alışveriş, kolay hesap erişimi.</p>
    </main>
    </>
  );
}
