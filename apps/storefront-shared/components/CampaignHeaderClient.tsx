"use client";

import type { PublicStarterNavigation, StarterThemeHeaderLayout } from "@celebix/saas-contracts";
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
import styles from "./campaign-header.module.css";

const focusable =
  "a[href],button:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CampaignHeaderClient({
  displayName,
  headerLayout,
  logo,
  logoAlignment,
  logoSize,
  navigation,
  desktopNavigation,
}: Readonly<{
  displayName: string;
  headerLayout: StarterThemeHeaderLayout;
  logoSize: "small" | "medium" | "large" | "xlarge";
  logoAlignment: "left" | "center";
  logo?: Readonly<{
    url: string;
    altText: string;
    width?: number;
    height?: number;
  }> | null;
  navigation: PublicStarterNavigation;
  desktopNavigation: ReactNode;
}>) {
  const pathname = usePathname();
  const nonHome = pathname === "/" ? "" : styles.nonHome;
  const [open, setOpen] = useState(false),
    [opaque, setOpaque] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null),
    dialogRef = useRef<HTMLElement>(null),
    sentinelRef = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

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
    requestAnimationFrame(() =>
      (
        dialogRef.current?.querySelector(focusable) as HTMLElement | null
      )?.focus(),
    );
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  function trapKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      const controls = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? []),
      ];
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
        className={`${styles.bar} ${opaque && !nonHome ? styles.opaque : ""} ${nonHome}`}
      >
        <div className={styles.container} data-header-layout={headerLayout}>
          {desktopNavigation}
          <Link
            className={styles.wordmark}
            href="/"
            aria-label={`${displayName} ana sayfa`}
            data-logo-alignment={logoAlignment}
            data-logo-size={logoSize}
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
          <div className={styles.actions}>
            <StoreUtilities />
            <button
              className={styles.menuButton}
              ref={triggerRef}
              type="button"
              aria-expanded={open}
              aria-controls="campaign-mobile-menu"
              aria-label="Menüyü aç"
              onClick={() => setOpen(true)}
            >
              <Menu aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {open ? (
        <div className={styles.backdrop} onMouseDown={backdrop}>
          <section
            className={styles.drawer}
            id="campaign-mobile-menu"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobil menü"
            onKeyDown={trapKeyboard}
          >
            <header>
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
                  isActivePath(pathname, "/products") ? "page" : undefined
                }
                href="/products"
                onClick={close}
              >
                Ürünler
              </Link>
              {navigation.items.map((item) => (
                <details key={item.slug}>
                  <summary>{item.name}</summary>
                  <Link
                    aria-current={
                      isActivePath(pathname, `/categories/${item.slug}`)
                        ? "page"
                        : undefined
                    }
                    href={`/categories/${item.slug}`}
                    onClick={close}
                  >
                    Tümünü gör
                  </Link>
                  {item.children.map((child) => (
                    <Link
                      aria-current={
                        isActivePath(pathname, `/categories/${child.slug}`)
                          ? "page"
                          : undefined
                      }
                      href={`/categories/${child.slug}`}
                      key={child.slug}
                      onClick={close}
                    >
                      {child.name}
                    </Link>
                  ))}
                </details>
              ))}
            </nav>
          </section>
        </div>
      ) : null}
    </>
  );
}
