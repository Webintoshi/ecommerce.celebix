"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";

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
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      launcherRef.current?.focus();
    };
  }, [launcherRef, open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") onClose();
  }

  return (
    <div className={styles.drawerLayer}>
      <button
        className={styles.backdrop}
        type="button"
        aria-label="Toshi asistanını kapat"
        onClick={onClose}
      />
      <aside
        id="toshi-assistant-drawer"
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="toshi-assistant-title"
        onKeyDown={handleKeyDown}
      >
        <header className={styles.drawerHeader}>
          <Image
            src="/toshi/toshi-profile.webp"
            width={52}
            height={52}
            alt=""
            aria-hidden="true"
          />
          <div>
            <h2 id="toshi-assistant-title" ref={titleRef} tabIndex={-1}>Toshi</h2>
            <p>Yapay zekâ mağaza asistanı</p>
          </div>
          <Link className={styles.workspaceLink} href="/toshi" onClick={onClose}>
            Tam ekran<ArrowUpRight aria-hidden="true" />
          </Link>
          <button className={styles.closeButton} type="button" aria-label="Toshi asistanını kapat" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <ToshiAssistant mode="drawer" />
      </aside>
    </div>
  );
}
