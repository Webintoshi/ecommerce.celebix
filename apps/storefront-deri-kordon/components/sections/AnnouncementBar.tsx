"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface AnnouncementSettings {
  message: string;
  link: string;
  linkText: string;
  enabled: boolean;
  backgroundColor: string;
}

const DEFAULT_SETTINGS: AnnouncementSettings = {
  message: "Ilk siparisinizde %10 indirim!",
  link: "/kampanyalar",
  linkText: "Hemen Kesfet",
  enabled: true,
  backgroundColor: "#0F1626",
};

const DISMISS_STORAGE_KEY = "derycraft-announcement-dismissed";

function normalizeAnnouncementColor(value?: string) {
  const normalized = (value || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toUpperCase();
  }

  return DEFAULT_SETTINGS.backgroundColor;
}

function getAnnouncementTextColor(hexColor: string) {
  const color = normalizeAnnouncementColor(hexColor);
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness > 150 ? "#0F1626" : "#FFFFFF";
}

export function AnnouncementBar() {
  const [settings, setSettings] = useState<AnnouncementSettings>(DEFAULT_SETTINGS);
  const [isVisible, setIsVisible] = useState(true);
  const { locale, internalPathname } = useStorefrontRoute();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1") {
        setIsVisible(false);
      }
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch("/api/settings?type=announcement", { cache: "no-store" });
        const payload = await response.json();

        if (!payload?.success || !payload?.announcementSettings) {
          return;
        }

        setSettings({ ...DEFAULT_SETTINGS, ...payload.announcementSettings });
      } catch (error) {
        console.error("Failed to fetch announcement settings:", error);
      }
    }

    void fetchSettings();
  }, []);

  if (!isVisible || !settings.enabled || internalPathname.startsWith("/admin")) {
    return null;
  }

  const announcementHref =
    settings.link && settings.link.startsWith("/") && locale
      ? buildLocalizedPath(settings.link, locale)
      : settings.link;
  const backgroundColor = normalizeAnnouncementColor(settings.backgroundColor);
  const textColor = getAnnouncementTextColor(backgroundColor);

  function handleDismiss() {
    setIsVisible(false);
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // sessionStorage unavailable
    }
  }

  return (
    <div
      className="relative z-50 border-b border-white/8"
      style={{ backgroundColor }}
      role="region"
      aria-label="Duyuru"
    >
      <div className="mx-auto flex h-9 max-w-[1500px] items-center justify-center px-11 sm:h-10 sm:px-14">
        <p
          className="text-center font-sans text-[10px] font-medium uppercase leading-snug tracking-[0.14em] sm:text-[11px] sm:tracking-[0.18em]"
          style={{ color: textColor }}
        >
          <span>{settings.message}</span>
          {announcementHref && settings.linkText ? (
            <>
              <span className="mx-2.5 hidden opacity-35 sm:inline" aria-hidden>
                |
              </span>
              <Link
                href={announcementHref}
                className="mt-1 inline-block underline decoration-1 underline-offset-[3px] transition-opacity hover:opacity-75 sm:mt-0 sm:inline"
              >
                {settings.linkText}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 opacity-50 transition-opacity hover:opacity-100 sm:right-4"
        style={{ color: textColor }}
        aria-label="Duyuruyu kapat"
      >
        <X className="h-3 w-3" strokeWidth={1.5} />
      </button>
    </div>
  );
}
