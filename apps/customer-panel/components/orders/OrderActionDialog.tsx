"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./order-action-dialog.module.css";

export interface OrderActionDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

/** Native modal semantics provide focus containment, Escape and an inert background. */
export function OrderActionDialog({ open, title, onClose, busy = false, children, footer }: OrderActionDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
    }
  }, [open]);

  useEffect(() => () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId}>{title}</h2>
        <button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label={`${title} penceresini kapat`}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </dialog>
  );
}
