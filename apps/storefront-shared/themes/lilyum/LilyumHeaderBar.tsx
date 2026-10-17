import type { ReactNode } from "react";
import Link from "next/link";
import type { PublicDesignMedia, PublicStarterNavigationItem } from "@celebix/saas-contracts";
import { StoreIcon } from "../../components/StoreIcon";
import { categoryPath, localizeStorefrontPath } from "../../lib/storefront-routes.ts";
import { LilyumIcon } from "./LilyumIcon";

export function LilyumMenuItems({ items, locale, close, prefetch }: { items: readonly PublicStarterNavigationItem[]; locale: string; close(): void; prefetch?: boolean }) {
  return <ul>{items.map(item => <li key={`${item.slug}-${item.path ?? ""}`}>
    <Link prefetch={prefetch} href={item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)} onClick={close}>{item.name}<LilyumIcon name="arrow" /></Link>
    {item.children.length ? <details><summary>{item.name} alt kategorileri</summary><LilyumMenuItems items={item.children} locale={locale} close={close} prefetch={prefetch} /></details> : null}
  </li>)}</ul>;
}

export function LilyumHeaderBar({ displayName, logo, navigation, locale, announcement, cartButton, menuButton, close = () => undefined, prefetch }: Readonly<{ displayName: string; logo?: PublicDesignMedia; navigation: readonly PublicStarterNavigationItem[]; locale: string; announcement: string; cartButton: ReactNode; menuButton: ReactNode; close?: () => void; prefetch?: boolean }>) {
 return (
    <header className="lf-header">
      {announcement ? <aside className="lf-announcement" aria-label="Mağaza duyuruları"><LilyumIcon name="truck" />{announcement}</aside> : null}
      <div className="lf-header-row lf-container">
        <Link prefetch={prefetch} className="lf-logo" href="/" aria-label={`${displayName} ana sayfa`}>{logo ? <img src={logo.url} alt={logo.altText || displayName} width="180" height="70" /> : displayName}</Link>
        <nav className="lf-desktop-nav" aria-label="Ana menü">{navigation.map(item => <div className="lf-nav-item" key={item.slug}>
          <Link prefetch={prefetch} href={item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)}>{item.name}</Link>
          {item.children.length ? <div className="lf-submenu"><LilyumMenuItems items={item.children} locale={locale} close={close} prefetch={prefetch} /></div> : null}
        </div>)}</nav>
        <nav className="lf-tools" aria-label="Mağaza araçları">
          <Link prefetch={prefetch} href="/search" aria-label="Ara"><StoreIcon name="search" /></Link>
          <Link prefetch={prefetch} className="lf-desktop-tool" href="/account" aria-label="Hesabım"><StoreIcon name="account" /></Link>
          {cartButton}
          {menuButton}
        </nav>
      </div>
    </header>
 );
}
