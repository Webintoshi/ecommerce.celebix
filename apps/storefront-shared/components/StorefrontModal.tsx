"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./storefront-modal.module.css";

export function StorefrontModal({ labelledBy, onDismiss, children }: Readonly<{
  labelledBy: string;
  onDismiss: () => void;
  children: ReactNode;
}>) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.viewport}
      aria-labelledby={labelledBy}
      onCancel={event => {
        event.preventDefault();
        onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}
