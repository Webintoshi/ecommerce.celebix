"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import type { PublicDesignMedia, PublicStarterNavigationItem } from "@celebix/saas-contracts";
import { StoreIcon } from "../../components/StoreIcon";
import { StorefrontSearchForm } from "../../components/StorefrontSearchForm";
import { useCartStatus } from "../../components/CartStatusProvider";
import { useHydrated } from "../../components/use-hydrated";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../../lib/storefront-routes.ts";
import { HizliIcon } from "./HizliIcon";
import { useCatalogScrollRestoration } from "../siora/useCatalogScrollRestoration";
import { HIZLI_KUTU_STOREFRONT_ID } from "./theme.ts";

type Item = PublicStarterNavigationItem;
type Props = { displayName: string; locale: string; logo?: PublicDesignMedia; navigation: readonly Item[]; images: Record<string, Readonly<{ url: string; altText: string }>>; announcement?: Readonly<{ text: string; destination?: string }>; layout?: string; width?: string };

export function HizliHeaderClient({ displayName, locale, logo, navigation, images, announcement, layout = "menu_logo_actions", width = "wide" }: Props) {
  const router = useRouter(), pathname = usePathname(), hydrated = useHydrated();
  const { cart, drawerOpen, openDrawer } = useCartStatus();
  const [panel, setPanel] = useState<"menu" | "search" | null>(null);
  const [trail, setTrail] = useState<readonly Item[]>([]);
  useCatalogScrollRestoration(HIZLI_KUTU_STOREFRONT_ID, pathname, panel !== null || drawerOpen, "hizli-kutu");
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  const previousPath = useRef(pathname), id = useId();
  const catalog = productIndexPath(locale);
  const destination = (item: Item) => item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug);
  const close = () => setPanel(null);
  const open = (kind: "menu" | "search", trigger: HTMLElement) => { opener.current = trigger; setTrail([]); setPanel(kind); };
  useEffect(() => { if (previousPath.current !== pathname) { previousPath.current = pathname; setPanel(null); } }, [pathname]);
  useEffect(() => {
    if (!panel || !dialog.current) return;
    const element = dialog.current, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    if (panel === "search") element.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
    else element.querySelector<HTMLButtonElement>('button[aria-label="Menüyü kapat"]')?.focus();
    return () => { element.close(); document.body.style.overflow = overflow; if (opener.current?.isConnected) opener.current.focus(); };
  }, [panel]);
  useEffect(() => {
    const listener = () => { if (panel) close(); };
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, [panel]);
  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); close(); router.push(href);
  }
  const count = hydrated ? cart?.itemCount ?? 0 : 0;
  const current = trail.at(-1), items = current ? current.children : navigation;
  const hideBottom = /\/(?:checkout|payments|odeme|account)(?:\/|$)/u.test(pathname);
  const productRoute = /\/(?:urun|products)\//u.test(pathname);
  return <>
    <header className="hk-header" data-layout={layout} data-width={width}>
      {announcement?.text ? <aside className="hk-announcement">{announcement.destination ? <Link href={announcement.destination}>{announcement.text}</Link> : announcement.text}</aside> : null}
      <div className="hk-container hk-header-row">
        <button className="hk-mobile-menu" type="button" aria-label="Menüyü aç" aria-controls={id} aria-expanded={panel === "menu"} onClick={event => open("menu", event.currentTarget)}><HizliIcon name="menu" /></button>
        <Link className="hk-wordmark" href="/" aria-label={`${displayName} ana sayfa`}>
          {logo ? <img src={logo.url} alt={logo.altText || displayName} width={180} height={50} /> : <span>{displayName}</span>}
        </Link>
        <nav className="hk-desktop-nav" aria-label="Ana menü">
          <Link href={catalog}>Tüm Ürünler</Link>
          <button type="button" aria-controls={id} aria-expanded={panel === "menu"} onClick={event => open("menu", event.currentTarget)}>Kategoriler<HizliIcon name="chevron" /></button>
          {navigation.slice(0, 2).map(item => <Link key={`${item.slug}-${item.path}`} href={destination(item)}>{item.name}</Link>)}
        </nav>
        <nav className="hk-tools" aria-label="Mağaza araçları">
          <button className="hk-search-trigger" type="button" aria-label="Ara" aria-controls={id} aria-expanded={panel === "search"} onClick={event => open("search", event.currentTarget)}><StoreIcon name="search" /><span>Ürün ara…</span></button>
          <Link className="hk-desktop-tool" href="/favorites" aria-label="Favoriler"><StoreIcon name="heart" /></Link>
          <Link className="hk-desktop-tool" href="/account" aria-label="Hesabım"><StoreIcon name="account" /></Link>
          <button type="button" aria-label="Sepet" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={event => openDrawer(event.currentTarget)}><HizliIcon name="bag" />{count > 0 ? <small>{Math.min(count, 999)}</small> : null}</button>
        </nav>
      </div>
    </header>
    <dialog id={id} ref={dialog} className="hk-dialog" data-panel={panel ?? undefined} aria-label={panel === "search" ? "Ürün ara" : "Kategoriler"} onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="hk-panel">
        <header className="hk-panel-heading"><h2>{panel === "search" ? "Ne arıyorsunuz?" : current?.name ?? "Kategoriler"}</h2><button type="button" aria-label={panel === "search" ? "Aramayı kapat" : "Menüyü kapat"} onClick={close}><HizliIcon name="close" /></button></header>
        {panel === "search" ? <><StorefrontSearchForm variant="panel" icon={<StoreIcon name="search" />} clientNavigation onNavigate={href => { close(); router.push(href); }} /><nav className="hk-search-links" aria-label="Ürünleri keşfet"><Link href={catalog} onClick={event => follow(event, catalog)}>Tüm ürünler<HizliIcon name="arrow" /></Link>{navigation.map(item => <Link key={item.slug} href={destination(item)} onClick={event => follow(event, destination(item))}>{item.name}</Link>)}</nav></> : <>
          <div className="hk-menu-path">{current ? <button type="button" onClick={() => setTrail(value => value.slice(0, -1))}>Geri</button> : <Link href={catalog} onClick={event => follow(event, catalog)}>Tüm ürünleri gör<HizliIcon name="arrow" /></Link>}{current ? <Link href={destination(current)} onClick={event => follow(event, destination(current))}>Tümünü gör</Link> : null}</div>
          <nav className="hk-category-menu" aria-label="Kategori menüsü">{items.length ? items.map(item => <div className="hk-menu-item" key={`${item.slug}-${item.path}`}>
            {item.children.length ? <button type="button" onClick={() => setTrail(value => [...value, item])}>{images[item.slug] ? <img src={images[item.slug].url} alt="" width={320} height={240} loading="lazy" /> : <span className="hk-placeholder" aria-hidden="true">Placeholder</span>}<span>{item.name}<HizliIcon name="chevron" /></span></button> : <Link href={destination(item)} onClick={event => follow(event, destination(item))}>{images[item.slug] ? <img src={images[item.slug].url} alt="" width={320} height={240} loading="lazy" /> : <span className="hk-placeholder" aria-hidden="true">Placeholder</span>}<span>{item.name}<HizliIcon name="arrow" /></span></Link>}
          </div>) : <p className="hk-menu-empty">Kategorilerimiz yakında burada.</p>}</nav>
          <div className="hk-menu-utilities"><Link href="/favorites" onClick={close}><StoreIcon name="heart" />Favoriler</Link><Link href="/account" onClick={close}><StoreIcon name="account" />Hesabım</Link></div>
        </>}
      </div>
    </dialog>
    {!hideBottom ? <nav className="hk-bottom-nav" aria-label="Alt gezinme" data-product={productRoute ? "true" : undefined} hidden={panel !== null || drawerOpen}>
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}><HizliIcon name="home" /><span>Ana Sayfa</span></Link>
      <button type="button" aria-label="Kategorileri aç" aria-expanded={panel === "menu"} onClick={event => open("menu", event.currentTarget)}><HizliIcon name="grid" /><span>Kategoriler</span></button>
      <button type="button" aria-label="Ürün ara" aria-expanded={panel === "search"} onClick={event => open("search", event.currentTarget)}><StoreIcon name="search" /><span>Ara</span></button>
      <button type="button" aria-label="Sepeti aç" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={event => openDrawer(event.currentTarget)}><HizliIcon name="bag" /><span>Sepet</span>{count > 0 ? <small>{Math.min(count, 999)}</small> : null}</button>
      <Link href="/account"><StoreIcon name="account" /><span>Hesabım</span></Link>
    </nav> : null}
  </>;
}
