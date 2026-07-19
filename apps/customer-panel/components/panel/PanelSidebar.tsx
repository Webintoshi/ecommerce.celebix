"use client";

import { X } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
  type TouchEvent,
} from "react";
import type { PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { LogoutButton } from "./LogoutButton";
import { PanelNavigation } from "./PanelNavigation";
import styles from "./panel-shell.module.css";

export function PanelSidebar({ model, mode, open = false, onClose, triggerRef }: {
  model: PanelChromeModel;
  mode: "desktop" | "drawer";
  open?: boolean;
  onClose?: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const touchStart = useRef<number | null>(null);
  const touchCurrent = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== "drawer" || !open) return;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = surfaceRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !surfaceRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !surfaceRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      triggerRef?.current?.focus();
    };
  }, [mode, onClose, open, triggerRef]);

  function finishSwipe() {
    if (
      touchStart.current !== null
      && touchCurrent.current !== null
      && touchCurrent.current - touchStart.current >= 64
    ) {
      onClose?.();
    }
    touchStart.current = null;
    touchCurrent.current = null;
  }

  function handleNavigationClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) onClose?.();
  }

  if (mode === "drawer") {
    if (!open) return null;
    return (
      <>
        <button
          type="button"
          className={styles.drawerBackdrop}
          aria-label="Panel menüsünü kapat"
          onClick={onClose}
        />
        <aside
          ref={surfaceRef}
          id="panel-mobile-drawer"
          className={styles.drawerSurface}
          role="dialog"
          aria-modal="true"
          aria-label="Mobil panel menüsü"
          onTouchStart={(event: TouchEvent<HTMLElement>) => {
            touchStart.current = event.touches[0]?.clientX ?? null;
            touchCurrent.current = touchStart.current;
          }}
          onTouchMove={(event: TouchEvent<HTMLElement>) => {
            touchCurrent.current = event.touches[0]?.clientX ?? touchCurrent.current;
          }}
          onTouchEnd={finishSwipe}
          onTouchCancel={finishSwipe}
        >
          <div className={styles.drawerHeader}>
            <Link className={styles.brand} href="/" aria-label="Celebix Panel ana sayfa" onClick={onClose}>
              <span aria-hidden="true">C</span><strong>Celebix</strong>
            </Link>
            <button
              ref={closeRef}
              type="button"
              className={styles.drawerClose}
              aria-label="Panel menüsünü kapat"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className={styles.merchantIdentity} aria-label="Etkin mağaza">
            <strong>{model.storeSlug}</strong><small>{model.membershipLabel}</small>
          </div>
          <div className={styles.drawerNavigation} onClick={handleNavigationClick}>
            <PanelNavigation mode="drawer" />
          </div>
          <div className={styles.sidebarFooter}><LogoutButton /></div>
        </aside>
      </>
    );
  }

  return (
    <aside className={styles.desktopSidebar}>
      <Link className={styles.brand} href="/" aria-label="Celebix Panel ana sayfa">
        <span aria-hidden="true">C</span><strong>Celebix</strong>
      </Link>
      <div className={styles.merchantIdentity} aria-label="Etkin mağaza">
        <strong>{model.storeSlug}</strong><small>{model.membershipLabel}</small>
      </div>
      <PanelNavigation mode={mode} />
      <div className={styles.sidebarFooter}><LogoutButton /></div>
    </aside>
  );
}
