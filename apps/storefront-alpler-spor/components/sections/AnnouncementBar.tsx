"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Truck, X } from "lucide-react";
import { repairDisplayText } from "@/lib/display-text";

interface AnnouncementSettings {
  message: string;
  link: string;
  linkText: string;
  enabled: boolean;
  backgroundColor: string;
}

const DEFAULT_SETTINGS: AnnouncementSettings = {
  message: "Alpler Spor'da güvenli ödeme, hızlı kargo ve kolay iade",
  link: "/urunler",
  linkText: "Ürünleri İncele",
  enabled: true,
  backgroundColor: "#0B0F14",
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
  const announcementMessage = repairDisplayText(settings.message);
  const announcementLinkText = repairDisplayText(settings.linkText);
  const isDarkTheme = textColor === "#FFFFFF";
  const buttonClass = isDarkTheme
    ? "border-white/15 bg-white/10 hover:bg-white/20 text-white"
    : "border-[#0B1120]/10 bg-[#0B1120]/8 hover:bg-[#0B1120]/12 text-[#0B1120]";
  const closeButtonClass = isDarkTheme
    ? "text-white/70 hover:text-white hover:bg-white/10"
    : "text-[#0B1120]/70 hover:text-[#0B1120] hover:bg-[#0B1120]/8";
  const dividerColor = isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(11,17,32,0.14)";

  return (
    <div className="relative border-b border-white/10" style={{ backgroundColor }}>
      <div className="container-premium relative px-4 py-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex min-h-[2.35rem] items-center justify-center pr-10 sm:pr-12">
          <div
            className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-[11px] font-medium tracking-wide sm:text-sm"
            style={{ color: textColor }}
          >
            <span className="inline-flex min-w-0 items-center justify-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#FF8A3D]" />
              <span className="min-w-0 break-words leading-5">{announcementMessage}</span>
            </span>
            {settings.link && announcementLinkText ? (
              <>
                <span className="hidden h-3.5 w-px sm:inline-block" style={{ backgroundColor: dividerColor }} />
                <Truck className="hidden h-3.5 w-3.5 shrink-0 text-[#FF8A3D] sm:block" />
                <Link
                  href={settings.link}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold leading-5 transition-colors sm:text-xs ${buttonClass}`}
                >
                  <span className="truncate">{announcementLinkText}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <button
        onClick={() => setIsVisible(false)}
        className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-colors duration-200 sm:right-4 ${closeButtonClass}`}
        aria-label="Kapat"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
