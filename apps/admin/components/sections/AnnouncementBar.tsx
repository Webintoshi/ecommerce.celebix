"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";

interface AnnouncementSettings {
  message: string;
  link: string;
  linkText: string;
  enabled: boolean;
}

const DEFAULT_SETTINGS: AnnouncementSettings = {
  message: "İlk siparişinizde %10 indirim!",
  link: "/kampanyalar",
  linkText: "Hemen Keşfet",
  enabled: true,
};

export function AnnouncementBar() {
  const [settings, setSettings] = useState<AnnouncementSettings>(DEFAULT_SETTINGS);
  const [isVisible, setIsVisible] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const supabase = getBrowserSupabaseClient();

        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "announcement_bar")
          .single();

        if (error) {
          console.log("Announcement settings not found, using defaults");
          return;
        }

        if (data?.value) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.value });
        }
      } catch (err) {
        console.error("Failed to fetch announcement settings:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  if (!isVisible || !settings.enabled || loading) return null;

  return (
    <div className="relative bg-[#7B1113]">
      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%] animate-[shimmer_3s_ease-in-out_infinite]"></div>
      
      <div className="container mx-auto px-4 py-2.5 relative">
        <div className="flex items-center justify-center">
          <p className="text-xs sm:text-sm text-white text-center font-medium tracking-wide">
            <span className="relative">
              <span className="relative z-10">{settings.message}</span>
              <span className="absolute inset-0 bg-white/20 blur-sm transform scale-110 animate-pulse"></span>
            </span>
            {settings.link && settings.linkText && (
              <Link
                href={settings.link}
                className="inline-flex items-center gap-1 ml-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-white font-semibold transition-all duration-300 hover:scale-105 active:scale-95"
              >
                {settings.linkText}
                <span className="text-xs animate-[bounce_1s_ease-in-out_infinite]">→</span>
              </Link>
            )}
          </p>
        </div>
      </div>
      
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-all duration-200 hover:rotate-90"
        aria-label="Kapat"
      >
        <X className="w-3.5 h-3.5 text-white/70 hover:text-white" />
      </button>
    </div>
  );
}
