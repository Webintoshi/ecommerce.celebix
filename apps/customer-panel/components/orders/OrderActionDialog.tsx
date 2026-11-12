"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./order-action-dialog.module.css";

export interface OrderActionDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly opener?: HTMLElement | null;
  readonly onClose: () => void;
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
}

/** Native modal semantics provide focus containment, Escape and an inert background. */
export function OrderActionDialog({ open, title, description, opener, onClose, busy = false, children, footer, className }: OrderActionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const activeElement = dialog.ownerDocument.activeElement;
      returnFocus.current = opener ?? (activeElement instanceof HTMLElement ? activeElement : null);
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target?.isConnected) target.focus();
    }
  }, [open, opener]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target?.isConnected) target.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog}${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
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
      <div className={styles.body}>{description ? <p id={descriptionId}>{description}</p> : null}{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </dialog>
  );
}
