import type { PublicStarterThemePresentationV3, PublicStorefront } from "@celebix/saas-contracts";
import Link from "next/link";

import { NewsletterForm } from "./NewsletterForm";

export function RetailFooter({ groups, presentation, storefront }: Readonly<{
  groups: PublicStarterThemePresentationV3["footer"]["groups"];
  presentation: PublicStarterThemePresentationV3;
  storefront: PublicStorefront;
}>) {
  return <footer className="store-footer retail-footer" data-footer-tone={presentation.footer.tone}>
    {presentation.footer.newsletter.enabled ? <section className="retail-footer-newsletter-band" aria-labelledby="retail-newsletter-heading"><div className="store-container retail-footer-newsletter-inner"><div><span>MAĞAZADAN HABERLER</span><h2 id="retail-newsletter-heading">{presentation.footer.newsletter.heading}</h2><p>{presentation.footer.newsletter.body}</p></div><NewsletterForm consentLabel={presentation.footer.newsletter.consentLabel} /></div></section> : null}
    <div className="store-container retail-footer-grid">
      <div className="retail-footer-brand"><strong>{presentation.displayName}</strong><p>{storefront.hostname}</p>{presentation.supportEmail ? <a href={`mailto:${presentation.supportEmail}`}>{presentation.supportEmail}</a> : null}</div>
      {groups.map((group) => <nav aria-label={group.heading} className="retail-footer-desktop-group" key={group.heading}><span>{group.heading}</span>{group.links.map((link) => <Link href={link.destination} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav>)}
      <div className="retail-footer-mobile">{groups.map((group) => <details key={group.heading}><summary>{group.heading}</summary><nav aria-label={`${group.heading} mobil`}>{group.links.map((link) => <Link href={link.destination} key={`${link.destination}-${link.label}`}>{link.label}</Link>)}</nav></details>)}</div>
    </div>
    {presentation.footer.social.length ? <nav className="store-container retail-footer-social" aria-label="Sosyal medya">{presentation.footer.social.map((item) => <a href={item.url} key={item.network} rel="noopener noreferrer">{item.network}</a>)}</nav> : null}
    <div className="store-container footer-bottom"><span>© {new Date().getUTCFullYear()} {presentation.displayName}</span><span>TRY · Türkçe</span></div>
  </footer>;
}
