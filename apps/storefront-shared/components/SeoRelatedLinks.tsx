import Link from "next/link";
import { publicSeoPath } from "../lib/public-seo.ts";

export function SeoRelatedLinks({ links, locale }: Readonly<{ links: readonly Readonly<{ anchorText: string; path: string }>[]; locale: string }>) {
  const seen = new Set<string>();
  const selected = links.filter(({ path, anchorText }) => {
    try { publicSeoPath(path); } catch { return false; }
    if (!anchorText.trim() || seen.has(path)) return false;
    seen.add(path);
    return true;
  }).slice(0, 12);
  if (!selected.length) return null;
  const title = /^tr(?:-|$)/i.test(locale) ? "İlgili içerikler" : "Related content";
  return <nav className="seo-related-links store-container" aria-label={title}><h2>{title}</h2><ul>{selected.map(({ path, anchorText }) => <li key={path}><Link href={path}>{anchorText}</Link></li>)}</ul></nav>;
}
