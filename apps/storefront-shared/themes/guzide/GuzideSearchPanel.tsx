"use client";

import type { PublicStarterNavigation } from "@celebix/saas-contracts";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { StorefrontSearchForm } from "../../components/StorefrontSearchForm";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../../lib/storefront-routes.ts";
import styles from "./guzide-search.module.css";

export function GuzideSearchPanel({ navigation, locale, onClose, onNavigate }: Readonly<{
  navigation: PublicStarterNavigation; locale: string; onClose(): void; onNavigate(href: string): void;
}>) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { document.body.style.overflow = original; };
  }, []);
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const controls = [...(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])') ?? [])]
      .filter(control => !control.closest("[hidden], [inert]"));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault(); onNavigate(href);
  }
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section id="guzide-search-panel" className={styles.panel} ref={panel} role="dialog" aria-modal="true" aria-labelledby="guzide-search-title" onKeyDown={keyboard}>
      <div className={styles.content}>
        <header className={styles.heading}>
          <h2 id="guzide-search-title">Ne arıyorsunuz?</h2>
          <button type="button" aria-label="Aramayı kapat" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <StorefrontSearchForm variant="panel" icon={<Search aria-hidden="true" />} clientNavigation onNavigate={onNavigate} />
        <nav className={styles.categories} aria-label="Koleksiyonu keşfedin">
          <p>Koleksiyonu keşfedin</p>
          <div>
            <Link href={productIndexPath(locale)} onClick={event => follow(event, productIndexPath(locale))}>Tüm ürünler</Link>
            {navigation.items.map(item => {
              const href = item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug);
              return <Link key={href} href={href} onClick={event => follow(event, href)}>{item.name}</Link>;
            })}
          </div>
        </nav>
      </div>
    </section>
  </div>;
}
