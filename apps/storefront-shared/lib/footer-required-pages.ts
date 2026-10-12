import { REQUIRED_STORE_PAGES, type PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";
import type { PublicStorefrontContentRepository } from "@celebix/saas-data";
import { renderMerchantContentBody } from "@celebix/platform-config/src/merchant-content-body.ts";

import { publicContentPath } from "./content-locale.ts";

type FooterGroups = PublicStarterThemePresentationV3["footer"]["groups"];
export type RequiredPageFooterLink = FooterGroups[number]["links"][number];
const EMPTY_LINKS: readonly RequiredPageFooterLink[] = Object.freeze([]);
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/u;
const INVISIBLE = /^[\s\u00ad\u200b-\u200f\u2060]*$/u;

function hasMeaningfulBody(body: string, format: "legacy" | "normalized_html"): boolean {
  const text = renderMerchantContentBody(body, format).replace(/<[^>]*>/gu, "").replace(
    /&(?:amp;)?(nbsp|ensp|emsp|thinsp|hairsp|numsp|puncsp|Tab|NewLine|ZeroWidthSpace|zwnj|zwj|shy|#(?:[xX][0-9a-fA-F]+|[0-9]+));/gu,
    (entity, name: string) => {
      if (!name.startsWith("#")) return "";
      const hex = /^#[xX]/u.test(name);
      const point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point >= 0 && point <= 0x10ffff && INVISIBLE.test(String.fromCodePoint(point)) ? "" : entity;
    },
  );
  return !INVISIBLE.test(text);
}

/** Optional older readers and individual read/render failures never invent public routes. */
export async function readPublishedRequiredPageFooterLinks(
  content: PublicStorefrontContentRepository,
  hostname: string,
  now: Date,
): Promise<readonly RequiredPageFooterLink[]> {
  if (!content.getLocales || !content.getRequiredPage) return EMPTY_LINKS;
  let defaultLocale: string;
  try {
    const locales = await content.getLocales({ hostname, now });
    if (typeof locales.defaultLocale !== "string" || !LOCALE.test(locales.defaultLocale)
      || !Array.isArray(locales.enabledLocales) || !locales.enabledLocales.includes(locales.defaultLocale)) return EMPTY_LINKS;
    defaultLocale = locales.defaultLocale;
  } catch { return EMPTY_LINKS; }

  const links = await Promise.all(REQUIRED_STORE_PAGES.map(async ({ key }) => {
    try {
      const source = await content.getRequiredPage!({ hostname, now, key, locale: defaultLocale });
      if (source.kind !== "page" || source.requiredPageKey !== key || source.locale !== defaultLocale
        || typeof source.publishedAt !== "string" || !Number.isFinite(Date.parse(source.publishedAt))
        || typeof source.title !== "string" || !source.title.trim() || typeof source.body !== "string"
        || !hasMeaningfulBody(source.body, source.bodyFormat)) return null;
      return Object.freeze({ label: source.title, destination: publicContentPath(source, defaultLocale) });
    } catch { return null; }
  }));
  return Object.freeze(links.filter((link): link is RequiredPageFooterLink => link !== null));
}

/** Existing merchant links win globally; only missing automatic destinations are appended. */
export function mergePublishedRequiredPageFooterGroups(
  groups: FooterGroups,
  links: readonly RequiredPageFooterLink[],
): FooterGroups {
  const existing = new Set(groups.flatMap(group => group.links.map(link => link.destination)));
  const additions = links.filter(link => {
    if (existing.has(link.destination)) return false;
    existing.add(link.destination);
    return true;
  });
  const storePosition = groups.findIndex(group => group.heading === "Mağaza");
  const output = groups.map((group, index) => Object.freeze({
    ...group,
    links: Object.freeze([
      ...group.links,
      ...(index === storePosition ? additions : []),
    ].map(link => Object.freeze({ ...link }))),
  }));
  if (storePosition === -1 && additions.length) output.push(Object.freeze({
    heading: "Mağaza", links: Object.freeze(additions.map(link => Object.freeze({ ...link }))),
  }));
  return Object.freeze(output);
}
