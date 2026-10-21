import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStorefront } from "@celebix/saas-contracts";
import { NewsletterForm } from "../../components/NewsletterForm";
import { localizeStorefrontPath } from "../../lib/storefront-routes.ts";
import { HizliIcon } from "./HizliIcon";

export function HizliFooter({ storefront, logo, groups, signature }: { storefront: PublicStorefront; logo?: PublicDesignMedia; groups: PublicStarterThemePresentationV3["footer"]["groups"]; signature: ReactNode }) {
  const p = storefront.presentation;
  const footer = p.schemaVersion === 3 || p.schemaVersion === 4 ? p.footer : null;
  const links = (group: typeof groups[number]) => group.links.map(link => <Link key={`${link.destination}-${link.label}`} href={localizeStorefrontPath(link.destination, storefront.locale)}>{link.label}</Link>);
  return <footer className="hk-footer" data-tone={footer?.tone ?? "dark"}>
    {footer?.newsletter.enabled ? <section className="hk-container hk-footer-newsletter"><div><h2>{footer.newsletter.heading}</h2><p>{footer.newsletter.body}</p></div><NewsletterForm consentLabel={footer.newsletter.consentLabel} /></section> : null}
    <div className="hk-container hk-footer-grid"><div className="hk-footer-brand"><Link href="/" aria-label={`${p.displayName} ana sayfa`}>{logo ? <img src={logo.url} alt={logo.altText || p.displayName} width={180} height={55} /> : <strong>{p.displayName}</strong>}</Link>{p.supportEmail ? <a href={`mailto:${p.supportEmail}`}>{p.supportEmail}<HizliIcon name="arrow" /></a> : null}</div>
      {groups.map(group => <nav className="hk-footer-desktop" aria-label={group.heading} key={group.heading}><h3>{group.heading}</h3>{links(group)}</nav>)}
      <div className="hk-footer-mobile">{groups.map(group => <details key={group.heading}><summary>{group.heading}<HizliIcon name="chevron" /></summary><nav aria-label={`${group.heading} mobil`}>{links(group)}</nav></details>)}</div>
    </div>
    <div className="hk-container hk-footer-bottom"><span>© {new Date().getUTCFullYear()} {p.displayName}</span>{footer?.social.length ? <nav aria-label="Sosyal medya">{footer.social.map(item => <a key={item.network} href={item.url} rel="noopener noreferrer">{item.network}</a>)}</nav> : null}<span>TRY · Türkçe</span></div>
    {signature}
  </footer>;
}
