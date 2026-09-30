import type { CSSProperties } from "react";
import Link from "next/link";
import type {
  PublicStarterThemePresentationV3,
  PublicStorefront,
} from "@celebix/saas-contracts";

import { NewsletterForm } from "@/components/NewsletterForm";
import { localizeStorefrontPath } from "@/lib/storefront-routes.ts";

import "./guzide-footer.css";

type FooterGroups = PublicStarterThemePresentationV3["footer"]["groups"];
type FooterStyle = CSSProperties & { "--guzide-footer-columns": string };

export type GuzideFooterProps = Readonly<{
  groups: FooterGroups;
  presentation: PublicStarterThemePresentationV3;
  storefront: PublicStorefront;
  logo?: Readonly<{ url: string; altText: string; width?: number; height?: number }> | null;
}>;

function FooterLinks({
  links,
  locale,
}: Readonly<{ links: FooterGroups[number]["links"]; locale: string }>) {
  return (
    <ul className="guzide-footer__links">
      {links.map((link) => (
        <li key={`${link.destination}-${link.label}`}>
          <Link href={localizeStorefrontPath(link.destination, locale)}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Chevron() {
  return (
    <svg
      className="guzide-footer__chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function GuzideFooter({
  groups,
  presentation,
  storefront,
  logo,
}: GuzideFooterProps) {
  const brandLogo = logo ?? presentation.logo;
  const newsletter = presentation.footer.newsletter;
  const style: FooterStyle = {
    "--guzide-footer-columns": [
      "220px",
      ...groups.map(() => "minmax(0, 1fr)"),
      ...(newsletter.enabled ? ["minmax(0, 300px)"] : []),
    ].join(" "),
  };
  const localeLabel = storefront.locale === "tr" ? "Türkçe" : storefront.locale;

  return (
    <footer className="guzide-footer" aria-label="Alt bilgi">
      <div className="guzide-footer__inner">
        <div className="guzide-footer__main" style={style}>
          <div className="guzide-footer__brand">
            <Link
              className="guzide-footer__logo"
              href="/"
              aria-label={`${presentation.displayName} ana sayfa`}
            >
              {brandLogo ? (
                <img
                  src={brandLogo.url}
                  alt={brandLogo.altText || presentation.displayName}
                  width={brandLogo.width}
                  height={brandLogo.height}
                  loading="lazy"
                />
              ) : (
                <strong>{presentation.displayName}</strong>
              )}
            </Link>
            <a className="guzide-footer__contact" href={storefront.canonicalUrl}>
              {storefront.hostname}
            </a>
            {presentation.supportEmail ? (
              <a
                className="guzide-footer__contact"
                href={`mailto:${presentation.supportEmail}`}
              >
                {presentation.supportEmail}
              </a>
            ) : null}
          </div>

          {groups.map((group, index) => (
            <nav
              className="guzide-footer__desktop-group"
              aria-label={group.heading}
              key={`${group.heading}-${index}`}
            >
              <h2 className="guzide-footer__heading">{group.heading}</h2>
              <FooterLinks links={group.links} locale={storefront.locale} />
            </nav>
          ))}

          <div className="guzide-footer__mobile-groups">
            {groups.map((group, index) => (
              <details className="guzide-footer__group" key={`${group.heading}-${index}`}>
                <summary className="guzide-footer__heading">
                  {group.heading}
                  <Chevron />
                </summary>
                <nav aria-label={`${group.heading} mobil`}>
                  <FooterLinks links={group.links} locale={storefront.locale} />
                </nav>
              </details>
            ))}
          </div>

          {newsletter.enabled ? (
            <section className="guzide-footer__newsletter" aria-labelledby="guzide-newsletter-title">
              <h2 id="guzide-newsletter-title" className="guzide-footer__newsletter-title">
                {newsletter.heading}
              </h2>
              <p className="guzide-footer__newsletter-copy">{newsletter.body}</p>
              <div className="guzide-footer__form">
                <NewsletterForm consentLabel={newsletter.consentLabel} />
              </div>
            </section>
          ) : null}
        </div>

        {presentation.footer.social.length ? (
          <nav className="guzide-footer__social" aria-label="Sosyal medya">
            {presentation.footer.social.map((item) => (
              <a href={item.url} key={item.network} rel="noopener noreferrer">
                {item.network}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="guzide-footer__bottom">
          <p className="guzide-footer__copyright">
            © {new Date().getUTCFullYear()} {presentation.displayName}
          </p>
          <span className="guzide-footer__locale">
            {storefront.currency} · {localeLabel}
          </span>
        </div>
      </div>
    </footer>
  );
}
