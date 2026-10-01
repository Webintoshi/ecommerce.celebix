import Link from "next/link";
import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStarterThemePresentationV4, PublicStorefront } from "@celebix/saas-contracts";
import { NewsletterForm } from "../../components/NewsletterForm";
import { localizeStorefrontPath } from "../../lib/storefront-routes.ts";

export function SioraFooter({ storefront, presentation, groups, logo, checkout = false }: Readonly<{
  storefront: PublicStorefront;
  presentation: PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4;
  groups: PublicStarterThemePresentationV3["footer"]["groups"];
  logo?: PublicDesignMedia;
  checkout?: boolean;
}>) {
  if (checkout) return <footer className="siora-checkout-footer store-container"><span>© {new Date().getUTCFullYear()} {presentation.displayName}</span><nav aria-label="Ödeme bilgileri">{groups.flatMap((group) => group.links).filter((link) => link.destination.startsWith("/policies/")).map((link) => <Link href={localizeStorefrontPath(link.destination, storefront.locale)} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav></footer>;
  return <footer className="siora-footer" data-footer-tone={presentation.footer.tone}>
    <div className="siora-footer-top store-container">
      <Link className="siora-footer-wordmark" href="/" aria-label={`${presentation.displayName} ana sayfa`}>{logo ? <img src={logo.url} alt={logo.altText || presentation.displayName} width={260} height={80} loading="lazy" /> : presentation.displayName}</Link>
      {presentation.supportEmail ? <a className="siora-footer-contact" href={`mailto:${presentation.supportEmail}`}>{presentation.supportEmail}</a> : null}
    </div>
    <div className="siora-footer-main store-container">
      <div className="siora-footer-groups">{groups.map((group) => <div className="siora-footer-group" key={group.heading}><nav className="siora-footer-desktop-group" aria-label={group.heading}><h2>{group.heading}</h2>{group.links.map((link) => <Link href={localizeStorefrontPath(link.destination, storefront.locale)} prefetch={false} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav><details className="siora-footer-mobile-group"><summary>{group.heading}<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m6 9 6 6 6-6" /></svg></summary><nav aria-label={`${group.heading} mobil`}>{group.links.map((link) => <Link href={localizeStorefrontPath(link.destination, storefront.locale)} prefetch={false} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav></details></div>)}</div>
      {presentation.footer.newsletter.enabled ? <section className="siora-footer-newsletter" aria-labelledby="siora-newsletter-title"><h2 id="siora-newsletter-title">{presentation.footer.newsletter.heading}</h2><p>{presentation.footer.newsletter.body}</p><NewsletterForm consentLabel={presentation.footer.newsletter.consentLabel} /></section> : null}
    </div>
    <div className="siora-footer-bottom store-container"><span>© {new Date().getUTCFullYear()} {presentation.displayName}</span>{presentation.footer.social.length ? <nav aria-label="Sosyal medya">{presentation.footer.social.map((social) => <a key={social.network} href={social.url} rel="noopener noreferrer">{social.network}</a>)}</nav> : null}<span>TRY · Türkçe</span></div>
  </footer>;
}
