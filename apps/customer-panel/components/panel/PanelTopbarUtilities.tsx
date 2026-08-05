"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ExternalLink } from "lucide-react";
import { useRef, useState } from "react";

import { ToshiDrawer } from "@/components/toshi/ToshiDrawer";

import { usePanelChromeModel } from "./PanelLayoutClient";
import styles from "./panel-shell.module.css";

export function PanelTopbarUtilities() {
  const model = usePanelChromeModel();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const storefrontHref = model.storefrontHostname
    ? `https://${model.storefrontHostname}/`
    : undefined;

  return (
    <div className={styles.desktopTopbarUtilities}>
      {storefrontHref ? (
        <a
          className={styles.topbarStorefrontLink}
          href={storefrontHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Mağazayı Gör"
        >
          <ExternalLink aria-hidden="true" />
          <span>Mağazayı Gör</span>
        </a>
      ) : null}
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
