"use client";

import type { PublicStarterNavigation } from "@celebix/saas-contracts";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { StoreUtilities } from "./StoreUtilities";
import { categoryPath, productIndexPath, localizeStorefrontPath } from "@/lib/storefront-routes.ts";
import styles from "./campaign-header.module.css";

const focusable =
  "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type CampaignHeaderClientProps = Readonly<{
  displayName: string;
  locale: string;
  logo?: Readonly<{ url: string; altText: string; width?: number; height?: number }> | null;
  navigation: PublicStarterNavigation;
  desktopNavigation: ReactNode;
  renderMobileMenu?: (close: () => void) => ReactNode;
  mobileMenuClassName?: string;
  mobileMenuController?: Readonly<{ isOpen: boolean; open(trigger: HTMLElement): void; close(): void; linkClick(event: MouseEvent<HTMLElement>): void }>;
}>;

export function CampaignHeaderClient({
  displayName,
  locale,
  logo,
  navigation,
  desktopNavigation,
  renderMobileMenu,
  mobileMenuClassName,
  mobileMenuController,
}: CampaignHeaderClientProps) {
  const pathname = usePathname();
  const nonHome = pathname === "/" ? "" : styles.nonHome;
  const [localOpen, setOpen] = useState(false),
    [opaque, setOpaque] = useState(false);
  const open = mobileMenuController?.isOpen ?? localOpen;
  const triggerRef = useRef<HTMLButtonElement>(null),
    dialogRef = useRef<HTMLElement>(null),
    sentinelRef = useRef<HTMLSpanElement>(null),
    openedPathRef = useRef(pathname);
  const close = useCallback(() => {
    if (mobileMenuController) { mobileMenuController.close(); return; }
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [mobileMenuController]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOpaque(!entry?.isIntersecting),
      { threshold: 1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      (
        dialogRef.current?.querySelector(focusable) as HTMLElement | null
      )?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = original;
    };
  }, [open]);
  useEffect(() => {
    if (!mobileMenuController && renderMobileMenu && open && pathname !== openedPathRef.current) close();
  }, [pathname, open, renderMobileMenu, mobileMenuController, close]);
  useEffect(() => {
    if (!renderMobileMenu || !open) return;
    const desktop = window.matchMedia("(min-width: 1025px)");
    const changed = () => { if (desktop.matches) close(); };
    changed();
    desktop.addEventListener("change", changed);
    return () => desktop.removeEventListener("change", changed);
  }, [open, renderMobileMenu, close]);

  function trapKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      const controls = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? []),
      ].filter(control => !control.closest("[hidden], [inert]") &&
        (!control.closest("details:not([open])") || control.tagName === "SUMMARY"));
      const first = controls[0],
        last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  function backdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) close();
  }

  return (
    <>
      <span className={styles.sentinel} ref={sentinelRef} aria-hidden="true" />
      <div
        data-storefront-header-bar
        className={`${styles.bar} ${opaque && !nonHome ? styles.opaque : ""} ${nonHome}`}
      >
        <div className={styles.container} data-storefront-header-container>
          {desktopNavigation}
          <Link
            className={styles.wordmark}
            data-storefront-wordmark
            href="/"
            aria-label={`${displayName} ana sayfa`}
          >
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */ <img
                src={logo.url}
                alt={logo.altText || displayName}
                width={logo.width ?? 180}
                height={logo.height ?? 48}
              />
            ) : (
              displayName
            )}
          </Link>
          <div className={styles.actions} data-storefront-header-actions>
            <StoreUtilities />
            <button
              className={styles.menuButton}
              ref={triggerRef}
              type="button"
              aria-expanded={open}
              aria-controls="campaign-mobile-menu"
              aria-label="Menüyü aç"
              onClick={event => { openedPathRef.current = pathname; if (mobileMenuController) mobileMenuController.open(event.currentTarget); else setOpen(true); }}
            >
              <Menu aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {open ? (
        <div className={styles.backdrop} onMouseDown={backdrop}>
          <section
            className={`${styles.drawer} ${mobileMenuClassName ?? ""}`}
            id="campaign-mobile-menu"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobil menü"
            onKeyDown={trapKeyboard}
            onClickCapture={mobileMenuController?.linkClick}
          >
            {renderMobileMenu ? renderMobileMenu(close) : <><header>
              <strong>{displayName}</strong>
              <button type="button" aria-label="Menüyü kapat" onClick={close}>
                <X aria-hidden="true" />
              </button>
            </header>
            <nav aria-label="Mobil menü">
              <Link
                aria-current={pathname === "/" ? "page" : undefined}
                href="/"
                onClick={close}
              >
                Ana Sayfa
              </Link>
              <Link
                aria-current={
                  isActivePath(pathname, productIndexPath(locale)) ? "page" : undefined
                }
                href={productIndexPath(locale)}
                onClick={close}
              >
                Ürünler
              </Link>
              {navigation.items.map((item) => (
                <details key={`${item.kind ?? "category"}:${item.resourceId ?? item.slug}`}>
                  <summary>{item.name}</summary>
                  <Link
                    aria-current={
                      isActivePath(pathname, (item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug)))
                        ? "page"
                        : undefined
                    }
                    href={(item.path ? localizeStorefrontPath(item.path, locale) : categoryPath(locale, item.slug))}
                    onClick={close}
                  >
                    Tümünü gör
                  </Link>
                  {item.children.map((child) => (
                    <Link
                      aria-current={
                        isActivePath(pathname, (child.path ? localizeStorefrontPath(child.path, locale) : categoryPath(locale, child.slug)))
                          ? "page"
                          : undefined
                      }
                      href={(child.path ? localizeStorefrontPath(child.path, locale) : categoryPath(locale, child.slug))}
                      key={`${child.kind ?? "category"}:${child.resourceId ?? child.slug}`}
                      onClick={close}
                    >
                      {child.name}
                    </Link>
                  ))}
                </details>
              ))}
            </nav></>}
          </section>
        </div>
      ) : null}
    </>
  );
}
