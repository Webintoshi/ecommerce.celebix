"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";

import type { DesignCanvasSurfaceItem, DesignCanvasTrigger } from "./design-surface-model";
import styles from "../design-settings.module.css";

interface DesignSettingsModalProps {
  readonly open: boolean;
  readonly inline?: boolean;
  readonly surface: DesignCanvasSurfaceItem;
  readonly children: ReactNode;
  readonly onClose?: () => void;
  readonly returnFocusRef: RefObject<DesignCanvasTrigger | null>;
}

const NOOP = () => undefined;

export function DesignSettingsModal({ open, inline = false, surface, children, onClose = NOOP, returnFocusRef }: Readonly<DesignSettingsModalProps>) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open || inline) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, inline, onClose]);

  useEffect(() => {
    if (!open || inline) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open, inline]);

  useEffect(() => {
    if (inline) return;
    if (open) {
      wasOpenRef.current = true;
      closeButtonRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef.current?.focus();
    }
  }, [open, inline, returnFocusRef]);

  const keepModalFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const controls = modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href]');
    if (!controls?.length) return;
    const first = controls[0]!, last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  if (!open) return null;
  if (inline) return <section id="design-inline-editor" className={styles.settingsPanel} aria-labelledby="design-inline-title">
    <header className={styles.panelHeader}><h2 id="design-inline-title">{surface.label}</h2></header>
    <div className={styles.panelBody}>{children}</div>
  </section>;
  return <>
    <button type="button" className={styles.modalBackdrop} aria-label="Ayarları kapat" onClick={onClose} />
    <aside ref={modalRef} className={styles.settingsModal} role="dialog" aria-modal="true" aria-labelledby="design-modal-title" aria-describedby="design-modal-description" onKeyDown={keepModalFocus}>
      <header className={styles.modalHeader}>
        <div><span>DÜZENLENİYOR</span><h2 id="design-modal-title">{surface.label}</h2><p id="design-modal-description">{surface.hint}</p></div>
        <button ref={closeButtonRef} type="button" aria-label="Ayarları kapat" onClick={onClose}><X size={20} /></button>
      </header>
      <div className={styles.modalBody}>{children}</div>
      <footer className={styles.modalFooter}>
        <p>Değişiklikler otomatik kaydedilir.</p>
        <button type="button" onClick={onClose}>Bitti</button>
      </footer>
    </aside>
  </>;
}
