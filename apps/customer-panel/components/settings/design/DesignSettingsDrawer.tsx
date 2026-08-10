"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";

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
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");
    const update = () => setModal(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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

  const keepModalFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!modal || event.key !== "Tab") return;
    const controls = drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href]');
    if (!controls?.length) return;
    const first = controls[0]!, last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  if (!open) return null;
  return <>
    <button type="button" className={styles.drawerBackdrop} aria-label="Ayarları kapat" onClick={onClose} />
    <aside ref={drawerRef} className={styles.settingsDrawer} role="dialog" aria-modal={modal ? "true" : undefined} aria-labelledby="design-drawer-title" aria-describedby="design-drawer-description" onKeyDown={keepModalFocus}>
      <header className={styles.drawerHeader}>
        <div><span>DÜZENLENİYOR</span><h2 id="design-drawer-title">{surface.label}</h2><p id="design-drawer-description">{surface.hint}</p></div>
        <button ref={closeButtonRef} type="button" aria-label="Ayarları kapat" onClick={onClose}><X size={20} /></button>
      </header>
      <div className={styles.drawerBody}>{children}</div>
    </aside>
  </>;
}
