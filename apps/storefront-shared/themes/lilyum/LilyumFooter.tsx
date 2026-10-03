import Link from "next/link";
import type { PublicDesignMedia, PublicStarterFooter, PublicStorefront } from "@celebix/saas-contracts";
import { localizeStorefrontPath } from "../../lib/storefront-routes.ts";
import { NewsletterForm } from "../../components/NewsletterForm";
import { LILYUM_REFINED_LOGO } from "./logo.ts";

export function LilyumFooter({ storefront, logo, groups, signature }: { storefront: PublicStorefront; logo?: PublicDesignMedia; groups: PublicStarterFooter["groups"]; signature: React.ReactNode }) {
  const presentation = storefront.presentation;
  const footer = presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.footer : null;
  return <footer className="lf-footer">
    <div className="lf-container lf-footer-main">
      <Link className="lf-footer-logo" data-refined-logo={logo?.url === LILYUM_REFINED_LOGO ? "true" : undefined} href="/" aria-label={`${presentation.displayName} ana sayfa`}>{logo ? <img src={logo.url} alt={logo.altText || presentation.displayName} width="180" height="70" loading="lazy" /> : presentation.displayName}</Link>
      <nav aria-label="Yardım"><Link href="/#lilyum-delivery">Teslimat</Link><a href={presentation.supportEmail ? `mailto:${presentation.supportEmail}` : "/pages/iletisim"}>İletişim</a></nav>
      <div className="lf-social">{footer?.social.map(item => <a key={item.url} href={item.url} aria-label={item.network}>{item.network}</a>)}</div>
      {signature}
    </div>
    <div className="lf-container lf-footer-details">
      <details><summary>Mağaza bilgileri ve politikalar</summary><div className="lf-footer-groups">{groups.map(group => <nav aria-label={group.heading} key={group.heading}><strong>{group.heading}</strong>{group.links.map(link => <Link key={`${link.destination}-${link.label}`} href={localizeStorefrontPath(link.destination, storefront.locale)}>{link.label}</Link>)}</nav>)}{presentation.supportEmail ? <a href={`mailto:${presentation.supportEmail}`}>{presentation.supportEmail}</a> : null}</div></details>
      {footer?.newsletter.enabled ? <section className="lf-footer-newsletter"><h2>{footer.newsletter.heading}</h2><p>{footer.newsletter.body}</p><NewsletterForm consentLabel={footer.newsletter.consentLabel} /></section> : null}
      <small>© {new Date().getUTCFullYear()} {presentation.displayName}</small>
    </div>
  </footer>;
}
