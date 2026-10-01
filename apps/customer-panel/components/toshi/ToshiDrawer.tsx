"use client";

import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { type MouseEvent, type RefObject, type SyntheticEvent, useEffect, useRef } from "react";

import { ToshiAssistant } from "./ToshiAssistant";
import styles from "./toshi.module.css";

export function ToshiDrawer({
  open,
  launcherRef,
  onClose,
}: Readonly<{
  open: boolean;
  launcherRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const backdropPress = useRef(false);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      launcherRef.current?.focus();
    };
  }, [launcherRef, open]);

  if (!open) return null;

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (backdropPress.current && event.target === event.currentTarget) onClose();
    backdropPress.current = false;
  }

  return (
    <dialog
      ref={dialogRef}
      id="toshi-assistant-drawer"
      className={styles.drawerLayer}
      aria-modal="true"
      aria-labelledby="toshi-assistant-title-drawer"
      onCancel={handleCancel}
      onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
      onClick={handleBackdropClick}
    >
      <aside
        className={styles.drawer}
      >
        <ToshiAssistant mode="drawer" titleRef={titleRef} headerActions={<>
          <Link className={styles.workspaceLink} href="/toshi" onClick={onClose} aria-label="Toshi’yi tam ekranda aç" title="Tam ekran">
            <ArrowUpRight aria-hidden="true" />
          </Link>
          <button className={styles.closeButton} type="button" aria-label="Toshi asistanını kapat" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </>} />
      </aside>
    </dialog>
  );
}
