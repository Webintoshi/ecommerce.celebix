"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Dot, X } from "lucide-react";
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
  message: "Sekersiz, balli ve hurmali secenekler ayni vitrinde.",
  link: "/urunler",
  linkText: "Koleksiyonu kesfet",
  enabled: true,
  backgroundColor: "#261710",
};

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

  return brightness > 150 ? "#0B1120" : "#FFFFFF";
}

export function AnnouncementBar() {
  const { locale } = useStorefrontRoute();
  const [settings, setSettings] = useState<AnnouncementSettings>(DEFAULT_SETTINGS);
  const [isVisible, setIsVisible] = useState(true);
  const [loading, setLoading] = useState(true);

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
      } finally {
        setLoading(false);
      }
    }

    void fetchSettings();
  }, []);

  if (!isVisible || !settings.enabled || loading) {
    return null;
  }

  const backgroundColor = normalizeAnnouncementColor(settings.backgroundColor);
  const textColor = getAnnouncementTextColor(backgroundColor);
  const isDarkTheme = textColor === "#FFFFFF";
  const closeButtonClass = isDarkTheme
    ? "text-white/65 hover:text-white hover:bg-white/10"
    : "text-[#0B1120]/60 hover:text-[#0B1120] hover:bg-[#0B1120]/8";
  const shimmerOverlay = isDarkTheme
    ? "linear-gradient(45deg,transparent 25%,rgba(255,255,255,0.08) 50%,transparent 75%,transparent 100%)"
    : "linear-gradient(45deg,transparent 25%,rgba(11,17,32,0.05) 50%,transparent 75%,transparent 100%)";
  const resolvedLink = settings.link.startsWith("/")
    ? buildLocalizedPath(settings.link, locale)
    : settings.link;

  return (
    <div className="relative" style={{ backgroundColor }}>
      <div
        className="absolute inset-0 bg-[length:250%_250%] animate-[shimmer_3s_ease-in-out_infinite]"
        style={{ backgroundImage: shimmerOverlay }}
      />

      <div className="container-premium relative px-2 py-2.5">
        <div className="flex items-center justify-center gap-2 pr-10 text-center">
          <div
            className="hidden items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.26em] sm:flex"
            style={{ color: textColor }}
          >
            <Dot className="h-4 w-4" />
            Ezmeo
          </div>
          <p className="text-xs font-medium tracking-[0.08em] sm:text-sm" style={{ color: textColor }}>
            {settings.message}
            {settings.link && settings.linkText ? (
              <Link
                href={resolvedLink}
                className="ml-2 inline-flex items-center gap-1 rounded-full border border-white/16 bg-white/10 px-3 py-1 font-semibold uppercase tracking-[0.16em] text-white transition-all duration-300 hover:bg-white/16"
              >
                {settings.linkText}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </p>
        </div>
      </div>

      <button
        onClick={() => setIsVisible(false)}
        className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-all duration-200 hover:rotate-90 sm:right-4 ${closeButtonClass}`}
        aria-label="Kapat"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
