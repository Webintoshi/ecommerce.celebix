import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";

import { resolveAccountAuthBranding } from "./account-auth-branding.ts";

type AccountAuthStyle = CSSProperties &
  Readonly<{
    "--store-primary": string;
    "--store-accent": string;
    "--store-background": string;
    "--store-text": string;
    "--account-brand-ink": string;
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
    "--account-brand-ink": branding.brandForeground,
  };

  return (
    <main
      className={`starter-storefront account-auth-shell ${branding.themeClasses}`}
      data-published-design={customized ? "true" : "false"}
      data-font={customized ? branding.fontFamily : undefined}
      style={style}
    >
      <section className="account-auth-brand" aria-label={branding.displayName}>
        <Link
          className="account-auth-wordmark"
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
        <div className="account-auth-brand-message">
          <p>Hesabınız, alışverişiniz.</p>
        </div>
        <Link className="account-auth-return" href="/">
          <span aria-hidden="true">←</span> Mağazaya dön
        </Link>
      </section>
      <section className="account-auth-panel">
        <div className="account-auth-panel-inner">
          <h1>{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
