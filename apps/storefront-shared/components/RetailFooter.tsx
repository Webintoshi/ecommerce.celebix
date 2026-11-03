import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStorefront } from "@celebix/saas-contracts";
import Link from "next/link";
import type { ReactNode } from "react";

import { NewsletterForm } from "./NewsletterForm";
import { FooterSocialIcon } from "./FooterSocialIcon";
import { FooterPaymentBranding } from "./PaymentTrust";
import { FooterSection } from "./ui/footer-section";
import { localizeStorefrontPath } from "../lib/storefront-routes.ts";
import { visibleFooterGroups } from "../lib/footer-navigation.ts";
import { alplerFooterLogo, alplerLogoDimensions } from "../themes/alpler/logo.ts";
import styles from "./retail-footer.module.css";

type FooterPresentation = Pick<PublicStarterThemePresentationV3, "displayName" | "supportEmail"> & Readonly<{
  footer: Pick<PublicStarterThemePresentationV3["footer"], "tone" | "social"> & Readonly<{
    newsletter?: PublicStarterThemePresentationV3["footer"]["newsletter"];
  }>;
}>;

export function RetailFooter({ groups, presentation, storefront, logo, signature, renderNewsletter }: Readonly<{
  groups: PublicStarterThemePresentationV3["footer"]["groups"];
  presentation: FooterPresentation;
  storefront: Pick<PublicStorefront, "locale" | "currency" | "hostname"> & Partial<Pick<PublicStorefront, "id" | "presentation">>;
  logo?: PublicDesignMedia;
  signature?: ReactNode;
  renderNewsletter?: (newsletter: PublicStarterThemePresentationV3["footer"]["newsletter"]) => ReactNode;
}>) {
  const newsletter = presentation.footer.newsletter;
  const brandLogo = logo ?? storefront.presentation?.logo;
  const identity = { id: storefront.id ?? "" };
  const darkLogo = alplerFooterLogo(identity, brandLogo, "dark");
  const dimensions = alplerLogoDimensions(identity, brandLogo);
  const hasToneArtwork = brandLogo && darkLogo && brandLogo.url !== darkLogo.url;
  const links = (group: typeof groups[number]) => group.links.map(link => <li key={`${link.destination}-${link.label}`}><Link prefetch={false} href={localizeStorefrontPath(link.destination, storefront.locale)}>{link.label}</Link></li>);
  const visibleGroups = visibleFooterGroups(groups);
  const localeLabel = storefront.locale === "tr" ? "Türkçe" : storefront.locale;
  return <FooterSection tone={presentation.footer.tone}
    intro={<>
        <Link className={styles.brand} href="/" prefetch={false} aria-label={`${presentation.displayName} ana sayfa`} data-footer-emblem={dimensions ? "true" : undefined}>
          {brandLogo ? <>
            <img className={styles.brandLogo} src={brandLogo.url} alt={brandLogo.altText || presentation.displayName} width={dimensions?.width ?? 180} height={dimensions?.height ?? 60} loading="lazy" decoding="async" data-footer-logo-tone={hasToneArtwork ? "light" : undefined} />
            {hasToneArtwork && darkLogo ? <img className={styles.brandLogo} src={darkLogo.url} alt={darkLogo.altText || presentation.displayName} width={dimensions?.width ?? 180} height={dimensions?.height ?? 60} loading="lazy" decoding="async" data-footer-logo-tone="dark" /> : null}
          </> : <strong>{presentation.displayName}</strong>}
        </Link>
        {newsletter?.enabled ? <section className={styles.newsletter} aria-labelledby="retail-newsletter-heading">
          <h2 id="retail-newsletter-heading">{newsletter.heading}</h2>
          {newsletter.body ? <p>{newsletter.body}</p> : null}
          {renderNewsletter ? renderNewsletter(newsletter) : <NewsletterForm consentLabel={newsletter.consentLabel} appearance="footer" />}
        </section> : <Link className={styles.storeAddress} href="/" prefetch={false}>{storefront.hostname}</Link>}
      </>}
    navigation={visibleGroups.length ? <>
        <div className={styles.desktopGroups}>{visibleGroups.map(group => <nav aria-label={group.heading} className={styles.group} key={group.heading}><h2>{group.heading}</h2><ul>{links(group)}</ul></nav>)}</div>
        <div className={styles.mobileGroups} data-retail-footer-mobile>{visibleGroups.map(group => <details key={group.heading}><summary>{group.heading}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg></summary><nav aria-label={`${group.heading} mobil`}><ul>{links(group)}</ul></nav></details>)}</div>
      </> : null}
    contact={<>{presentation.supportEmail ? <a href={`mailto:${presentation.supportEmail}`}>{presentation.supportEmail}</a> : <Link href="/" prefetch={false}>{storefront.hostname}</Link>}<span>{storefront.currency} · {localeLabel}</span></>}
    social={presentation.footer.social.length ? <nav className={styles.social} aria-label="Sosyal medya">{presentation.footer.social.map(item => <a href={item.url} key={item.network} aria-label={item.network === "x" ? "X" : item.network} title={item.network === "x" ? "X" : item.network} rel="noopener noreferrer"><FooterSocialIcon network={item.network} /></a>)}</nav> : null}
    copyright={<>© {new Date().getUTCFullYear()} {presentation.displayName}<span data-google-consent-preferences-host /></>}
    signature={signature}
    alternateSignature={signature ? <FooterPaymentBranding tone={presentation.footer.tone === "dark" ? "light" : "dark"} /> : null}
  />;
}
