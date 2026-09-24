"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Eye } from "lucide-react";
import { useRef, useState } from "react";

import { ToshiDrawer } from "@/components/toshi/ToshiDrawer";

import styles from "./panel-shell.module.css";

export function PanelTopbarUtilities({ storefrontHostname }: { storefrontHostname?: string }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={styles.desktopTopbarUtilities}>
      {storefrontHostname ? (
        <a
          className={styles.topbarUtilityButton}
          aria-label="Mağazayı gör"
          title="Mağazayı gör"
          href={`https://${storefrontHostname}/`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Eye aria-hidden="true" />
        </a>
      ) : (
        <button
          className={styles.topbarUtilityButton}
          aria-label="Mağazayı gör"
          title="Mağaza adresi henüz hazır değil"
          type="button"
          disabled
        >
          <Eye aria-hidden="true" />
        </button>
      )}
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
        aria-label="Bana Sorun"
        aria-expanded={helpOpen}
        aria-controls="toshi-assistant-drawer"
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
            unoptimized
          />
        </span>
      </button>
      <ToshiDrawer
        open={helpOpen}
        launcherRef={helpButtonRef}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
}
