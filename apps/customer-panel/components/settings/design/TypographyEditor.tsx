"use client";

import { useEffect, useMemo, useState } from "react";
import type { StorefrontDesignFontOption, StorefrontDesignFontWeight, StorefrontDesignTypography } from "@celebix/saas-contracts";

import { FEATURED_STOREFRONT_FONT_CATALOG } from "../../../lib/storefront-fonts/catalog";
import styles from "../design-settings.module.css";
import { filterTypographyFonts, selectTypographyFont, selectTypographySize, selectTypographyWeight, type TypographyRole } from "./typography-model";

const WEIGHT_LABELS = Object.freeze({ "400": "Normal", "500": "Orta", "600": "Yarı kalın", "700": "Kalın", "800": "Çok kalın" } as const);
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 .&()+-]{0,119}$/;
const WEIGHTS = Object.freeze(["400", "500", "600", "700", "800"] as const);

function parseCatalog(value: unknown): Readonly<{ fonts: readonly StorefrontDesignFontOption[]; degraded: boolean }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("font_catalog_invalid");
  const root = value as Record<string, unknown>;
  if (typeof root.degraded !== "boolean" || !Array.isArray(root.fonts)) throw new TypeError("font_catalog_invalid");
  const fonts = root.fonts.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new TypeError("font_catalog_invalid");
    const font = item as Record<string, unknown>;
    if (Object.keys(font).sort().join(",") !== "availableWeights,category,family,source" || typeof font.family !== "string" || !FAMILY.test(font.family) || !["sans-serif", "serif", "display", "handwriting", "monospace"].includes(String(font.category)) || font.source !== "google" || !Array.isArray(font.availableWeights)) throw new TypeError("font_catalog_invalid");
    const availableWeights = font.availableWeights.filter((weight): weight is StorefrontDesignFontWeight => typeof weight === "string" && WEIGHTS.includes(weight as StorefrontDesignFontWeight));
    if (!availableWeights.length || availableWeights.length !== font.availableWeights.length || new Set(availableWeights).size !== availableWeights.length) throw new TypeError("font_catalog_invalid");
    return Object.freeze({ family: font.family, category: font.category as StorefrontDesignFontOption["category"], availableWeights: Object.freeze(availableWeights), source: "google" as const });
  });
  if (!fonts.length) throw new TypeError("font_catalog_empty");
  return Object.freeze({ fonts: Object.freeze(fonts), degraded: root.degraded });
}

function RoleEditor({ role, typography, fonts, disabled, onChange }: Readonly<{ role: TypographyRole; typography: StorefrontDesignTypography; fonts: readonly StorefrontDesignFontOption[]; disabled: boolean; onChange(value: StorefrontDesignTypography): void }>) {
  const [query, setQuery] = useState("");
  const heading = role === "heading";
  const selected = heading ? typography.headingFont : typography.bodyFont;
  const weight = heading ? typography.headingWeight : typography.bodyWeight;
  const size = heading ? typography.headingSizePx : typography.bodySizePx;
  const choices = useMemo(() => filterTypographyFonts(fonts, query, selected), [fonts, query, selected]);
  const title = heading ? "Başlık" : "Metin";
  return <section className={styles.typographyRole}>
    <header><strong>{title} stili</strong><span>{selected.category}</span></header>
    <div className={styles.field}><label htmlFor={`typography-${role}-search`}>{title} yazı tipi</label><input id={`typography-${role}-search`} type="search" value={query} placeholder="Google Fonts içinde ara" disabled={disabled} onChange={(event) => setQuery(event.currentTarget.value)} /><select aria-label={`${title} yazı tipi seçimi`} value={selected.family} disabled={disabled} onChange={(event) => { const font = fonts.find(({ family }) => family === event.currentTarget.value); if (font) onChange(selectTypographyFont(typography, role, font)); }}>{choices.map((font) => <option key={font.family} value={font.family}>{font.family} · {font.category}</option>)}</select></div>
    <div className={styles.typographyControls}><div className={styles.field}><label htmlFor={`typography-${role}-weight`}>{title} kalınlığı</label><select id={`typography-${role}-weight`} value={weight} disabled={disabled} onChange={(event) => onChange(selectTypographyWeight(typography, role, event.currentTarget.value as StorefrontDesignFontWeight))}>{selected.availableWeights.map((available) => <option key={available} value={available}>{WEIGHT_LABELS[available]} · {available}</option>)}</select></div><div className={styles.field}><label htmlFor={`typography-${role}-size`}>{title} boyutu</label><div className={styles.pixelField}><input id={`typography-${role}-size`} type="number" inputMode="numeric" min={heading ? 24 : 14} max={heading ? 72 : 20} step={1} value={size} disabled={disabled} onChange={(event) => onChange(selectTypographySize(typography, role, event.currentTarget.valueAsNumber))} /><span>px</span></div></div></div>
    <p className={styles.typographySample} style={{ fontFamily: `'${selected.family}', ${selected.category}`, fontSize: `${size}px`, fontWeight: Number(weight) }}>{heading ? "Mağazanızın güçlü başlıkları" : "Ürünlerinizi anlatan rahat ve okunaklı metinler."}</p>
  </section>;
}

export function TypographyEditor({ value, disabled, onChange }: Readonly<{ value: StorefrontDesignTypography; disabled: boolean; onChange(value: StorefrontDesignTypography): void }>) {
  const [catalog, setCatalog] = useState<readonly StorefrontDesignFontOption[]>(() => Object.freeze([...FEATURED_STOREFRONT_FONT_CATALOG, value.headingFont, value.bodyFont]));
  const [degraded, setDegraded] = useState(false), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/storefront-design/fonts", { method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new TypeError("font_catalog_unavailable"); return parseCatalog(await response.json()); }).then((result) => { setCatalog(result.fonts); setDegraded(result.degraded); }).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) { setCatalog(FEATURED_STOREFRONT_FONT_CATALOG); setDegraded(true); } }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  return <div className={styles.typographyEditor} aria-busy={loading}><div className={styles.typographyIntro}><strong>Mağaza tipografisi</strong><p>Başlık ve normal metinleri ayrı ayrı seçin. Yalnız kullanılan fontlar mağazada yüklenir.</p></div>{degraded ? <p className={styles.catalogNotice} role="status">Google Fonts kataloğunun güvenli yedek listesi kullanılıyor.</p> : null}<RoleEditor role="heading" typography={value} fonts={catalog} disabled={disabled || loading} onChange={onChange} /><RoleEditor role="body" typography={value} fonts={catalog} disabled={disabled || loading} onChange={onChange} /></div>;
}
