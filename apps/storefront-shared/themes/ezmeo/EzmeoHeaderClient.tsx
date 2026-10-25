"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import type { PublicDesignMedia, PublicStarterNavigationItem, StarterThemeVisualV2 } from "@celebix/saas-contracts";
import { StoreIcon } from "../../components/StoreIcon";
import { StorefrontSearchForm } from "../../components/StorefrontSearchForm";
import { useCartStatus } from "../../components/CartStatusProvider";
import { useHydrated } from "../../components/use-hydrated";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../../lib/storefront-routes.ts";
import { useCatalogScrollRestoration } from "../siora/useCatalogScrollRestoration";
import { EZMEO_STOREFRONT_ID } from "./theme.ts";

type Item = PublicStarterNavigationItem;
type Panel = "menu" | "search";
type Props = Readonly<{
  displayName: string;
  locale: string;
  logo?: PublicDesignMedia;
  navigation: readonly Item[];
  layout?: StarterThemeVisualV2["headerLayout"];
  width?: "contained" | "wide";
  style?: "overlay" | "solid";
}>;

function HeaderIcon({ name }: Readonly<{ name: "menu" | "close" | "arrow" | "chevron" | "bag" }>) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {name === "menu" ? <path d="M4 8h16M4 16h16" />
      : name === "close" ? <path d="m6 6 12 12M6 18 18 6" />
        : name === "arrow" ? <path d="M4 12h15m-5-5 5 5-5 5" />
          : name === "chevron" ? <path d="m9 5 7 7-7 7" />
            : <><path d="M5 7.5h14l1 13H4Z" /><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" /></>}
  </svg>;
}

export function EzmeoHeaderClient({ displayName, locale, logo, navigation, layout = "menu_logo_actions", width = "wide", style = "solid" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { cart, drawerOpen, openDrawer } = useCartStatus();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [trail, setTrail] = useState<readonly Item[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuHeadingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previousPathRef = useRef(pathname);
  const dialogId = useId();
  const headingId = `${dialogId}-title`;
  const catalog = productIndexPath(locale);
  const current = trail.at(-1);
  const items = current?.children ?? navigation;
  const count = hydrated ? cart?.itemCount ?? 0 : 0;

  useCatalogScrollRestoration(EZMEO_STOREFRONT_ID, pathname, panel !== null || drawerOpen, "ezmeo");

  const destination = (item: Item) => item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug);
  const close = () => setPanel(null);
  function open(kind: Panel, trigger: HTMLElement, item?: Item) {
    openerRef.current = trigger;
    setTrail(item ? [item] : []);
    setPanel(kind);
  }
  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
    router.push(href);
  }

  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      previousPathRef.current = pathname;
      setPanel(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!panel || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const opener = openerRef.current;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    if (panel === "search") dialog.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
    else dialog.querySelector<HTMLButtonElement>("[data-ezmeo-panel-close]")?.focus();
    const onPopState = () => setPanel(null);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [panel]);

  useEffect(() => {
    if (panel === "menu") menuHeadingRef.current?.focus({ preventScroll: true });
  }, [panel, trail]);

  return <>
    <header className="ez-header" data-ezmeo-header data-storefront-header-bar data-header-layout={layout} data-header-width={width} data-header-style={style}>
      <div className="ez-header-row" data-storefront-header-container>
        <button className="ez-menu-trigger ez-icon-button" type="button" aria-label="Menüyü aç" aria-controls={dialogId} aria-haspopup="dialog" aria-expanded={panel === "menu"} onClick={event => open("menu", event.currentTarget)}><HeaderIcon name="menu" /></button>
        <Link className="ez-wordmark" data-storefront-wordmark href="/" aria-label={`${displayName} ana sayfa`}>
          {logo ? <img src={logo.url} alt={logo.altText || displayName} width={180} height={56} /> : <span>{displayName}</span>}
        </Link>
        <nav className="ez-desktop-nav" aria-label="Ana menü">
          <button className="ez-desktop-menu-trigger" type="button" aria-label="Menüyü aç" aria-controls={dialogId} aria-haspopup="dialog" aria-expanded={panel === "menu" && trail.length === 0} onClick={event => open("menu", event.currentTarget)}><HeaderIcon name="menu" /><span>Menü</span></button>
          <Link href={catalog} aria-current={pathname === catalog ? "page" : undefined}>Tüm ürünler</Link>
          {navigation.map((item, index) => item.children.length
            ? <button key={`${item.slug}-${item.path ?? index}`} type="button" aria-controls={dialogId} aria-haspopup="dialog" aria-expanded={panel === "menu" && trail[0] === item} onClick={event => open("menu", event.currentTarget, item)}>{item.name}<HeaderIcon name="chevron" /></button>
            : <Link key={`${item.slug}-${item.path ?? index}`} href={destination(item)} aria-current={pathname === destination(item) ? "page" : undefined}>{item.name}</Link>)}
        </nav>
        <nav className="ez-header-tools" aria-label="Mağaza araçları">
          <button className="ez-search-trigger ez-icon-button" type="button" aria-label="Ürün ara" aria-controls={dialogId} aria-haspopup="dialog" aria-expanded={panel === "search"} onClick={event => open("search", event.currentTarget)}><StoreIcon name="search" /><span>Ara</span></button>
          <button className="ez-cart-trigger ez-icon-button" type="button" aria-label={count > 0 ? `Sepet, ${count} ürün` : "Sepet"} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={event => openDrawer(event.currentTarget)}><HeaderIcon name="bag" />{count > 0 ? <span className="ez-cart-count" aria-hidden="true">{count > 99 ? "99+" : count}</span> : null}</button>
        </nav>
      </div>
    </header>
    <dialog id={dialogId} ref={dialogRef} className="ez-header-dialog" data-ezmeo-header data-panel={panel ?? undefined} aria-labelledby={headingId}
      onCancel={event => { event.preventDefault(); close(); }} onClose={event => { if (!event.currentTarget.open) close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="ez-header-panel">
        <header className="ez-panel-heading"><h2 id={headingId} ref={menuHeadingRef} tabIndex={-1}>{panel === "search" ? "Ne arıyorsunuz?" : current?.name ?? "Keşfet"}</h2><button className="ez-icon-button" type="button" data-ezmeo-panel-close aria-label={panel === "search" ? "Aramayı kapat" : "Menüyü kapat"} onClick={close}><HeaderIcon name="close" /></button></header>
        {panel === "search" ? <div className="ez-search-content">
          <StorefrontSearchForm variant="panel" icon={<StoreIcon name="search" />} clientNavigation onNavigate={href => { close(); router.push(href); }} />
          <Link className="ez-all-products" href={catalog} onClick={event => follow(event, catalog)}>Tüm ürünleri gör<HeaderIcon name="arrow" /></Link>
        </div> : <>
          <div className="ez-menu-path">
            {current ? <button type="button" onClick={() => setTrail(value => value.slice(0, -1))}><HeaderIcon name="chevron" />Geri</button> : <Link href={catalog} onClick={event => follow(event, catalog)}>Tüm ürünleri gör<HeaderIcon name="arrow" /></Link>}
            {current ? <Link href={destination(current)} onClick={event => follow(event, destination(current))}>Tümünü gör<HeaderIcon name="arrow" /></Link> : null}
          </div>
          <nav className="ez-category-list" aria-label={current ? `${current.name} alt menüsü` : "Kategori menüsü"}>
            {items.map((item, index) => <div className="ez-category-row" key={`${item.slug}-${item.path ?? index}`}>
              <Link href={destination(item)} onClick={event => follow(event, destination(item))}>{item.name}{item.children.length ? null : <HeaderIcon name="arrow" />}</Link>
              {item.children.length ? <button type="button" aria-label={`${item.name} alt kategorilerini aç`} onClick={() => setTrail(value => [...value, item])}><HeaderIcon name="chevron" /></button> : null}
            </div>)}
          </nav>
          <nav className="ez-menu-utilities" aria-label="Hesap ve favoriler">
            <Link href="/favorites" onClick={event => follow(event, "/favorites")}><StoreIcon name="heart" />Favoriler</Link>
            <Link href="/account" onClick={event => follow(event, "/account")}><StoreIcon name="account" />Hesabım</Link>
          </nav>
        </>}
      </div>
    </dialog>
  </>;
}
