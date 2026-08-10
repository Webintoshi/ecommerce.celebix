"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import type { DesignCanvasSurfaceItem } from "./design-surface-model";
import styles from "../design-settings.module.css";

interface DesignSettingsDrawerProps {
  readonly open: boolean;
  readonly surface: DesignCanvasSurfaceItem;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function DesignSettingsDrawer({ open, surface, children, onClose, returnFocusRef }: Readonly<DesignSettingsDrawerProps>) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      closeButtonRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef.current?.focus();
    }
  }, [open, returnFocusRef]);

  if (!open) return null;
  return <>
    <button type="button" className={styles.drawerBackdrop} aria-label="Ayarları kapat" onClick={onClose} />
    <aside className={styles.settingsDrawer} role="dialog" aria-modal="true" aria-labelledby="design-drawer-title" aria-describedby="design-drawer-description">
      <header className={styles.drawerHeader}>
        <div><span>DÜZENLENİYOR</span><h2 id="design-drawer-title">{surface.label}</h2><p id="design-drawer-description">{surface.hint}</p></div>
        <button ref={closeButtonRef} type="button" aria-label="Ayarları kapat" onClick={onClose}><X size={20} /></button>
      </header>
      <div className={styles.drawerBody}>{children}</div>
    </aside>
  </>;
}
