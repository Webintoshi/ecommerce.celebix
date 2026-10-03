"use client";

import type { PublicStarterNavigationItem, PublicStorefrontAsset } from "@celebix/saas-contracts";
import { ArrowLeft, ChevronRight, Heart, House, Mail, Search, ShoppingBag, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { CampaignHeaderClientProps } from "../../components/CampaignHeaderClient";
import { isValidProductCatalogSearch } from "../../lib/product-catalog-query.ts";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../../lib/storefront-routes.ts";
import { useGuzideMobileExperience } from "./GuzideMobileExperience";
import type { GuzideMenuImages } from "./guzide-menu.ts";
import styles from "./guzide-mobile-menu.module.css";

type Props = Pick<CampaignHeaderClientProps, "displayName" | "locale" | "logo" | "navigation"> & Readonly<{ menuImages: GuzideMenuImages; supportEmail?: string; onClose: () => void; onNavigate?: (href: string) => void }>;

function MenuPhoto({ image, hero = false }: { image?: PublicStorefrontAsset; hero?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return null;
  return <img className={hero ? styles.hero : undefined} src={image.url} alt="" width={hero ? 640 : 60} height={hero ? 292 : 64}
    loading={hero ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />;
}

export function GuzideMobileMenu({ displayName, locale, logo, navigation, menuImages, supportEmail, onClose, onNavigate }: Props) {
  const router = useRouter(), pathname = usePathname();
  const [trail, setTrail] = useState<readonly number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null), backRef = useRef<HTMLButtonElement>(null),
    levelRef = useRef<HTMLElement>(null), scrollRef = useRef<HTMLDivElement>(null),
    focusTarget = useRef<number | "back" | null>(null);
  let items = navigation.items;
  let current: PublicStarterNavigationItem | undefined;
  for (const index of trail) {
    current = items[index];
    if (!current) { items = navigation.items; break; }
    items = current.children;
  }
  const hrefFor = (item: PublicStarterNavigationItem) => item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug);
  const imageFor = (item: PublicStarterNavigationItem) => item.kind === "catalog_collection"
    ? (item.featured?.slug === item.slug ? item.featured.image : undefined)
    : menuImages[item.slug];
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    const target = focusTarget.current;
    if (target === "back") backRef.current?.focus();
    else if (typeof target === "number") levelRef.current?.querySelector<HTMLElement>(`[data-menu-index="${target}"]`)?.focus();
    focusTarget.current = null;
  }, [trail]);
  function enter(index: number) { focusTarget.current = "back"; setTrail(previous => [...previous, index]); }
  function back() { focusTarget.current = trail.at(-1) ?? null; setTrail(previous => previous.slice(0, -1)); }
  const session = useGuzideMobileExperience();
  useEffect(() => session?.registerMenuBack(() => { if (!trail.length) return false; back(); return true; }), [session?.registerMenuBack, trail]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    if (!query || !isValidProductCatalogSearch(query) || /[\u0080-\u009f]/u.test(query)) {
      inputRef.current?.setCustomValidity(!query ? "Aramak istediğiniz ürünü yazın." : "Lütfen daha kısa bir arama metni yazın.");
      inputRef.current?.reportValidity();
      return;
    }
    const href = `/search?q=${encodeURIComponent(query)}`;
    if (onNavigate) onNavigate(href); else { onClose(); router.push(href); }
  }
  function rows(submenu: boolean) {
    return items.map((item, index) => {
      const hasChildren = item.children.length > 0;
      const content = <>{!submenu ? <MenuPhoto image={imageFor(item)} /> : null}<span>{item.name}</span><ChevronRight aria-hidden="true" /></>;
      const className = `${styles.row} ${submenu ? styles.subrow : ""}`;
      const key = `${item.kind ?? "category"}:${item.resourceId ?? item.slug}`;
      return hasChildren
        ? <button key={key} className={className} type="button" data-menu-index={index} aria-expanded="false" aria-controls="guzide-menu-level" onClick={() => enter(index)}>{content}</button>
        : <Link key={key} className={className} href={hrefFor(item)} data-menu-index={index} prefetch={false} aria-current={pathname === hrefFor(item) ? "page" : undefined} onClick={onClose}>{content}</Link>;
    });
  }
  return <>
    <header className={styles.header}>
      <button className={styles.close} type="button" aria-label="Menüyü kapat" onClick={onClose}><X aria-hidden="true" /></button>
      <Link className={styles.brand} href="/" prefetch={false} aria-label={`${displayName} ana sayfa`} onClick={onClose}>
        {logo ? <img src={logo.url} alt={logo.altText || displayName} width={logo.width ?? 190} height={logo.height ?? 88} /> : <span>{displayName}</span>}
      </Link>
    </header>
    <form className={styles.search} role="search" action="/search" method="get" onSubmit={submit}>
      <button type="submit" aria-label="Ürün ara"><Search aria-hidden="true" /></button>
      <label className="sr-only" htmlFor="guzide-menu-search">Ürün veya kategori ara</label>
      <input id="guzide-menu-search" ref={inputRef} type="search" name="q" placeholder="Ürün veya kategori ara" autoComplete="off" enterKeyHint="search" required maxLength={100} onInput={event => event.currentTarget.setCustomValidity("")} />
    </form>
    <div className={styles.scroll} ref={scrollRef}>
      <div className={styles.content}>
        {current ? <>
          <button className={styles.back} ref={backRef} type="button" aria-label={trail.length === 1 ? "Ana menüye dön" : "Önceki menüye dön"} onClick={back}><ArrowLeft aria-hidden="true" /><span>{trail.length === 1 ? "Menü" : "Geri"}</span></button>
          <h2 className={styles.heading}>{current.name}</h2>
          <MenuPhoto key={current.slug} image={imageFor(current)} hero />
          <Link className={styles.all} href={hrefFor(current)} prefetch={false} onClick={onClose}>Tüm {current.name}<ChevronRight aria-hidden="true" /></Link>
        </> : <p className={styles.eyebrow}>KEŞFET</p>}
        <nav className={styles.navigation} ref={levelRef} id="guzide-menu-level" data-guzide-menu-level key={trail.join(".")} aria-label={current ? `${current.name} alt kategorileri` : "Mobil kategoriler"}>{rows(Boolean(current))}</nav>
        {!current ? <>
          <div className={styles.secondary}>
            <Link href={productIndexPath(locale)} prefetch={false} onClick={onClose}>Tüm Ürünler<ChevronRight aria-hidden="true" /></Link>
            <Link href="/" prefetch={false} onClick={onClose}><House aria-hidden="true" />Ana Sayfa<ChevronRight aria-hidden="true" /></Link>
          </div>
          <div className={styles.utilities} aria-label="Hesap ve alışveriş">
            <Link href="/account" prefetch={false} onClick={onClose}><UserRound aria-hidden="true" /><span>Hesabım</span></Link>
            <Link href="/favorites" prefetch={false} onClick={onClose}><Heart aria-hidden="true" /><span>Favorilerim</span></Link>
            <Link href="/cart" prefetch={false} onClick={onClose}><ShoppingBag aria-hidden="true" /><span>Sepetim</span></Link>
          </div>
          {supportEmail ? <a className={styles.support} href={`mailto:${supportEmail}`} onClick={onClose}><Mail aria-hidden="true" /><span>Bize ulaşın<small>{supportEmail}</small></span></a> : null}
        </> : null}
      </div>
    </div>
  </>;
}
