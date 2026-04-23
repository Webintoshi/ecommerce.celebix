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
  message: "Alpler Spor'da guvenli odeme, hizli kargo ve kolay iade",
  link: "/urunler",
  linkText: "Urunleri Incele",
  enabled: true,
  backgroundColor: "#173D32",
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
    ? "bg-white/12 hover:bg-white/20 text-white"
    : "bg-[#0B1120]/10 hover:bg-[#0B1120]/15 text-[#0B1120]";
  const closeButtonClass = isDarkTheme
    ? "text-white/70 hover:text-white hover:bg-white/10"
    : "text-[#0B1120]/70 hover:text-[#0B1120] hover:bg-[#0B1120]/8";
  const shimmerOverlay = isDarkTheme
    ? "linear-gradient(45deg,transparent 25%,rgba(255,255,255,0.08) 50%,transparent 75%,transparent 100%)"
    : "linear-gradient(45deg,transparent 25%,rgba(11,17,32,0.05) 50%,transparent 75%,transparent 100%)";

  return (
    <div className="relative" style={{ backgroundColor }}>
      <div
        className="absolute inset-0 bg-[length:250%_250%] animate-[shimmer_3s_ease-in-out_infinite]"
        style={{ backgroundImage: shimmerOverlay }}
      />

      <div className="container mx-auto px-4 py-2.5 relative">
        <div className="flex items-center justify-center">
          <p className="text-xs sm:text-sm text-center font-medium tracking-wide" style={{ color: textColor }}>
            <span className="relative">
              <span className="relative z-10">{settings.message}</span>
              <span
                className="absolute inset-0 blur-sm scale-110 animate-pulse"
                style={{ backgroundColor: isDarkTheme ? "rgba(255,255,255,0.18)" : "rgba(11,17,32,0.08)" }}
              />
            </span>
            {settings.link && settings.linkText ? (
              <Link
                href={settings.link}
                className={`ml-2 inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition-all duration-300 hover:scale-105 active:scale-95 ${buttonClass}`}
              >
                {settings.linkText}
                <span className="text-xs animate-[bounce_1s_ease-in-out_infinite]">→</span>
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
