"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import styles from "./panel-shell.module.css";

const HELP_LINKS = Object.freeze([
  { href: "/", label: "Mağaza özetini aç" },
  { href: "/orders", label: "Siparişlere git" },
  { href: "/products", label: "Ürünleri yönet" },
  { href: "/analytics", label: "Analizleri görüntüle" },
] as const);

export function PanelTopbarUtilities() {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (helpOpen) closeButtonRef.current?.focus();
  }, [helpOpen]);

  function closeHelp() {
    setHelpOpen(false);
    requestAnimationFrame(() => helpButtonRef.current?.focus());
  }

  return (
    <div className={styles.desktopTopbarUtilities}>
      <Link
        className={styles.topbarUtilityButton}
        href="/settings/notifications"
        aria-label="Bildirim merkezi"
      >
        <Bell aria-hidden="true" />
      </Link>
      <button
        ref={helpButtonRef}
        className={styles.topbarAssistantButton}
        type="button"
        aria-expanded={helpOpen}
        aria-controls="panel-management-help"
        onClick={() => setHelpOpen((current) => !current)}
      >
        <span>Bana Sorun</span>
        <span className={styles.topbarAssistantAvatar}>
          <Image
            src="/toshi/toshi-profile.webp"
            width={48}
            height={48}
            alt="Toshi yapay zekâ mağaza asistanı"
            priority
          />
        </span>
      </button>
      {helpOpen ? (
        <section
          id="panel-management-help"
          className={styles.topbarHelpPopover}
          aria-label="Yönetim paneli yardımı"
          onKeyDown={(event) => { if (event.key === "Escape") closeHelp(); }}
        >
          <header>
            <div><strong>Nasıl yardımcı olabilirim?</strong><small>Gerçek ve kullanılabilir yönetim alanlarına hızlıca ulaşın.</small></div>
            <button ref={closeButtonRef} type="button" onClick={closeHelp} aria-label="Yardımı kapat"><X /></button>
          </header>
          <nav aria-label="Yönetim yardım bağlantıları">
            {HELP_LINKS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setHelpOpen(false)}>
                <span>{item.label}</span><ChevronRight aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </section>
      ) : null}
    </div>
  );
}
