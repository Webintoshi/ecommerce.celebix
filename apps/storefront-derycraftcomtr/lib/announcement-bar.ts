"use client";

import { useCallback, useEffect, useState } from "react";

export interface AnnouncementSettings {
  message: string;
  link: string;
  linkText: string;
  enabled: boolean;
  backgroundColor: string;
}

export const DEFAULT_ANNOUNCEMENT_SETTINGS: AnnouncementSettings = {
  message: "Ilk siparisinizde %10 indirim!",
  link: "/kampanyalar",
  linkText: "Hemen Kesfet",
  enabled: true,
  backgroundColor: "#0F1626",
};

export const ANNOUNCEMENT_DISMISS_STORAGE_KEY = "derycraft-announcement-dismissed";

export function normalizeAnnouncementColor(value?: string) {
  const normalized = (value || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toUpperCase();
  }

  return DEFAULT_ANNOUNCEMENT_SETTINGS.backgroundColor;
}

export function getAnnouncementTextColor(hexColor: string) {
  const color = normalizeAnnouncementColor(hexColor);
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness > 150 ? "#0F1626" : "#FFFFFF";
}

export function useAnnouncementBar() {
  const [settings, setSettings] = useState<AnnouncementSettings>(DEFAULT_ANNOUNCEMENT_SETTINGS);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY) === "1") {
        setIsDismissed(true);
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

        setSettings({ ...DEFAULT_ANNOUNCEMENT_SETTINGS, ...payload.announcementSettings });
      } catch (error) {
        console.error("Failed to fetch announcement settings:", error);
      }
    }

    void fetchSettings();
  }, []);

  const backgroundColor = normalizeAnnouncementColor(settings.backgroundColor);
  const textColor = getAnnouncementTextColor(backgroundColor);
  const isEnabled = settings.enabled;
  const isVisible = isEnabled && !isDismissed;

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY, "1");
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  return {
    settings,
    backgroundColor,
    textColor,
    isEnabled,
    isVisible,
    dismiss,
  };
}
