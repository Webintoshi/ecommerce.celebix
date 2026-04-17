"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

interface AnnouncementSettings {
  message: string;
  link: string;
  linkText: string;
  enabled: boolean;
  backgroundColor: string;
}

const DEFAULT_SETTINGS: AnnouncementSettings = {
  message: "Ayn\u0131 g\u00fcn teslimat i\u00e7in se\u00e7ili vitrini inceleyin.",
  link: "/urunler",
  linkText: "Vitrini Ac",
  enabled: true,
  backgroundColor: "#DA630D",
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
  const buttonClass = isDarkTheme
    ? "border-white/20 bg-white/10 text-white hover:bg-white/16"
    : "border-[#0B1120]/12 bg-[#0B1120]/6 text-[#0B1120] hover:bg-[#0B1120]/10";
  const closeButtonClass = isDarkTheme
    ? "text-white/65 hover:text-white hover:bg-white/10"
    : "text-[#0B1120]/60 hover:text-[#0B1120] hover:bg-[#0B1120]/8";

  return (
    <div className="relative border-b border-black/5" style={{ backgroundColor }}>
      <div className="container-premium py-1.5 sm:py-2">
        <div className="flex items-center justify-center gap-2 pr-10 text-center sm:gap-3 sm:pr-0">
          <p
            className="hidden text-[10px] font-semibold uppercase tracking-[0.24em] sm:block"
            style={{ color: textColor, opacity: 0.72 }}
          >
            {"G\u00fcncel Duyuru"}
          </p>
          <p className="max-w-3xl text-[11px] font-medium sm:text-[13px]" style={{ color: textColor }}>
            {settings.message}
          </p>
          {settings.link && settings.linkText ? (
            <Link
              href={settings.link}
              className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition sm:inline-flex ${buttonClass}`}
            >
              {settings.linkText}
              <span aria-hidden="true">/</span>
            </Link>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsVisible(false)}
        className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 transition sm:right-5 ${closeButtonClass}`}
        aria-label="Kapat"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
