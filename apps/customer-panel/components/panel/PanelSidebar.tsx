"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";
import type { PanelClientChromeModel } from "@/lib/panel-ui/client-chrome-model";
import { LogoutButton } from "./LogoutButton";
import { PanelNavigation } from "./PanelNavigation";
import { StoreSwitcher } from "./StoreSwitcher";
import styles from "./panel-shell.module.css";

function PanelBrand({ onClick }: { onClick?: () => void }) {
  return (
    <Link className={styles.brand} href="/" aria-label="Celebix Panel ana sayfa" onClick={onClick}>
      <span className={styles.brandMark}>
        <Image src="/Logo/celebix-beyaz-logo.svg" width={1540} height={390} alt="Celebix" priority />
      </span>
    </Link>
  );
}

function SidebarFooter({ model }: { model: PanelClientChromeModel }) {
  const initial = model.storeSlug.charAt(0).toLocaleUpperCase("tr-TR");

  return (
    <div className={styles.sidebarFooter}>
      {model.activeStoreSelectionKey && model.storeOptions ? (
        <StoreSwitcher stores={model.storeOptions} activeStoreSelectionKey={model.activeStoreSelectionKey} />
      ) : null}
      <div className={styles.sidebarAccount} aria-label="Etkin mağaza">
        <span className={styles.sidebarAvatar} aria-hidden="true">{initial}</span>
        <span className={styles.sidebarAccountCopy}>
          <strong>{model.storeSlug}</strong>
          <small>{model.membershipLabel}</small>
        </span>
      </div>
      <LogoutButton />
    </div>
  );
}

export function PanelSidebar({ model, mode, open = false, onClose, onRestoreFocus }: {
  model: PanelClientChromeModel;
  mode: "desktop" | "drawer";
  open?: boolean;
  onClose?: () => void;
  onRestoreFocus?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const touchStart = useRef<number | null>(null);
  const touchCurrent = useRef<number | null>(null);
  const [drawerPresent, setDrawerPresent] = useState(open);
  const reduceMotion = useReducedMotion();
  const motionDuration = reduceMotion ? 0.00001 : 0.2;

  useEffect(() => {
    if (mode !== "drawer" || !open) return;
    setDrawerPresent(true);
    closeRef.current?.focus();
  }, [mode, open]);

  useEffect(() => {
    if (mode !== "drawer" || !drawerPresent) return;
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
    };
  }, [drawerPresent, mode, onClose]);

  const handleDrawerExitComplete = useCallback(() => {
    setDrawerPresent(false);
    onRestoreFocus?.();
  }, [onRestoreFocus]);

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
    return (
      <AnimatePresence onExitComplete={handleDrawerExitComplete}>
        {open ? (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionDuration }}
              type="button"
              className={styles.drawerBackdrop}
              aria-label="Panel menüsünü kapat"
              onClick={onClose}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: motionDuration }}
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
                <PanelBrand onClick={onClose} />
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
              <div className={styles.drawerNavigation} onClick={handleNavigationClick}>
                <PanelNavigation mode="drawer" analyticsAvailable={model.analyticsAvailable} />
              </div>
              <SidebarFooter model={model} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    );
  }

  return (
    <aside className={styles.desktopSidebar}>
      <PanelBrand />
      <PanelNavigation mode={mode} analyticsAvailable={model.analyticsAvailable} />
      <SidebarFooter model={model} />
    </aside>
  );
}
