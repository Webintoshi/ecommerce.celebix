import { parseRequiredPageKey } from "@celebix/saas-contracts";
import type { PublicContentLocales, PublicContentV2 } from "@celebix/saas-data";

const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function selectContentLocale(locales: PublicContentLocales, raw: unknown): string | null {
  if (raw === undefined) return locales.defaultLocale;
  if (typeof raw !== "string" || !LOCALE.test(raw) || !locales.enabledLocales.includes(raw)) return null;
  return raw;
}

export function contentPath(kind: "page" | "blog_post", slug: string, locale: string, defaultLocale: string): string {
  if (!SLUG.test(slug) || slug.length > 100 || !LOCALE.test(locale) || !LOCALE.test(defaultLocale)) throw new TypeError("public_content_route_invalid");
  const base = `${kind === "page" ? "/pages/" : "/blog/"}${slug}`;
  return locale === defaultLocale ? base : `${base}?lang=${locale}`;
}

export function publicContentPath(source: Pick<PublicContentV2, "kind" | "slug" | "locale" | "requiredPageKey">, defaultLocale: string): string {
  const path = contentPath(source.kind, source.slug, source.locale, defaultLocale);
  if (source.requiredPageKey === undefined) return path;
  const key = parseRequiredPageKey(source.requiredPageKey);
  if (source.kind !== "page") throw new TypeError("public_content_route_invalid");
  return key === "blog" ? blogIndexPath(source.locale, defaultLocale) : path;
}

export function blogIndexPath(locale: string, defaultLocale: string, cursor?: string): string {
  if (!LOCALE.test(locale) || !LOCALE.test(defaultLocale)) throw new TypeError("public_content_route_invalid");
  const query = new URLSearchParams();
  if (locale !== defaultLocale) query.set("lang", locale);
  if (cursor) query.set("cursor", cursor);
  return `/blog${query.size ? `?${query}` : ""}`;
}
