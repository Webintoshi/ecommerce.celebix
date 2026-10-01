import Link from "next/link";
import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStarterThemePresentationV4, PublicStorefront } from "@celebix/saas-contracts";
import { NewsletterForm } from "../../components/NewsletterForm";
import { localizeStorefrontPath } from "../../lib/storefront-routes.ts";
import { alplerFooterLogo, alplerLogoDimensions } from "./logo.ts";

export function AlplerFooter({ storefront, presentation, groups, logo, checkout = false }: Readonly<{
  storefront: PublicStorefront;
  presentation: PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4;
  groups: PublicStarterThemePresentationV3["footer"]["groups"];
  logo?: PublicDesignMedia;
  checkout?: boolean;
}>) {
  if (checkout) return <footer className="alpler-checkout-footer store-container"><span>© {new Date().getUTCFullYear()} {presentation.displayName}</span><nav aria-label="Ödeme bilgileri">{groups.flatMap((group) => group.links).filter((link) => link.destination.startsWith("/policies/")).map((link) => <Link href={localizeStorefrontPath(link.destination, storefront.locale)} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav></footer>;
  const footerLogo = alplerFooterLogo(storefront, logo, presentation.footer.tone);
  const logoDimensions = alplerLogoDimensions(storefront, footerLogo);
  return <footer className="alpler-footer" data-footer-tone={presentation.footer.tone}>
    <div className="alpler-footer-top store-container">
      <Link className="alpler-footer-wordmark" data-alpler-emblem={logoDimensions ? "true" : undefined} href="/" aria-label={`${presentation.displayName} ana sayfa`}>{footerLogo ? <img src={footerLogo.url} alt={footerLogo.altText || presentation.displayName} width={logoDimensions?.width ?? 260} height={logoDimensions?.height ?? 80} loading="lazy" /> : presentation.displayName}</Link>
      {presentation.supportEmail ? <a className="alpler-footer-contact" href={`mailto:${presentation.supportEmail}`}>{presentation.supportEmail}</a> : null}
    </div>
    <div className="alpler-footer-main store-container">
      <div className="alpler-footer-groups">{groups.map((group) => <div className="alpler-footer-group" key={group.heading}><nav className="alpler-footer-desktop-group" aria-label={group.heading}><h2>{group.heading}</h2>{group.links.map((link) => <Link href={localizeStorefrontPath(link.destination, storefront.locale)} prefetch={false} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav><details className="alpler-footer-mobile-group"><summary>{group.heading}<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m6 9 6 6 6-6" /></svg></summary><nav aria-label={`${group.heading} mobil`}>{group.links.map((link) => <Link href={localizeStorefrontPath(link.destination, storefront.locale)} prefetch={false} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav></details></div>)}</div>
      {presentation.footer.newsletter.enabled ? <section className="alpler-footer-newsletter" aria-labelledby="alpler-newsletter-title"><h2 id="alpler-newsletter-title">{presentation.footer.newsletter.heading}</h2><p>{presentation.footer.newsletter.body}</p><NewsletterForm consentLabel={presentation.footer.newsletter.consentLabel} /></section> : null}
    </div>
    <div className="alpler-footer-bottom store-container"><span>© {new Date().getUTCFullYear()} {presentation.displayName}</span>{presentation.footer.social.length ? <nav aria-label="Sosyal medya">{presentation.footer.social.map((social) => <a key={social.network} href={social.url} rel="noopener noreferrer">{social.network}</a>)}</nav> : null}<span>TRY · Türkçe</span></div>
  </footer>;
}
