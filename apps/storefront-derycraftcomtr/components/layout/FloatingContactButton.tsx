"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  Instagram,
  MessageCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import { useStoreInfo } from "@/lib/store-info-context";
import {
  getFloatingContactDefaultLabel,
  isFloatingContactExternalHref,
  normalizeFloatingContactSettings,
  resolveFloatingContactHref,
  type FloatingContactChannelType,
} from "@celebix/platform-config/src/floating-contact";

const POSITION_CLASSES = {
  "bottom-right": "bottom-5 right-5 sm:bottom-7 sm:right-7",
  "bottom-left": "bottom-5 left-5 sm:bottom-7 sm:left-7",
  "top-right": "top-24 right-6",
  "top-left": "top-24 left-6",
} as const;

const CHANNEL_STYLES: Record<FloatingContactChannelType, string> = {
  whatsapp: "border-[#25D366]/20 bg-white text-[#175F35] hover:border-[#25D366]/45 hover:bg-[#F1FBF5]",
  instagram:
    "border-[#DD2A7B]/20 bg-white text-[#5B2445] hover:border-[#DD2A7B]/40 hover:bg-[#FFF5FA]",
  form: "border-[#18110B]/10 bg-white text-[#18110B] hover:border-[#18110B]/20 hover:bg-[#F7F1EA]",
};

export function FloatingContactButton() {
  const { storeInfo } = useStoreInfo();
  const [isOpen, setIsOpen] = useState(false);
  const settings = useMemo(
    () => normalizeFloatingContactSettings(storeInfo?.floatingContact),
    [storeInfo?.floatingContact]
  );
  const channels = useMemo(
    () =>
      settings.channels
        .map((channel) => ({
          ...channel,
          resolvedHref: resolveFloatingContactHref(channel),
        }))
        .filter((channel) => (channel.enabled || channel.href.trim().length > 0) && channel.resolvedHref),
    [settings.channels]
  );

  if (!settings.enabled || channels.length === 0) {
    return null;
  }

  const isBottomPosition = settings.position.startsWith("bottom");

  return (
    <div className={`pointer-events-none fixed z-40 ${POSITION_CLASSES[settings.position]}`}>
      <div
        className={`pointer-events-auto flex items-end ${
          isBottomPosition ? "flex-col" : "flex-col-reverse"
        }`}
      >
        <div className={`flex flex-col gap-2 ${isBottomPosition ? "mb-3" : "mt-3"}`}>
          {isOpen
            ? channels.map((channel) => {
                const label = channel.label || getFloatingContactDefaultLabel(channel.type);
                const external = isFloatingContactExternalHref(channel.resolvedHref);

                return (
                  <a
                    key={channel.type}
                    href={channel.resolvedHref}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer noopener" : undefined}
                    className={`group inline-flex min-w-[214px] items-center justify-between gap-3 rounded-full border px-4 py-3 text-sm font-semibold shadow-[0_16px_36px_rgba(17,16,14,0.12)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${CHANNEL_STYLES[channel.type]}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {getChannelIcon(channel.type)}
                      {label}
                    </span>
                    <ExternalLink className="h-4 w-4 opacity-55 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                  </a>
                );
              })
            : null}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="group relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#18110B]/10 bg-[#18110B] text-white shadow-[0_18px_42px_rgba(17,16,14,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#2A211A] hover:shadow-[0_22px_48px_rgba(17,16,14,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6B37]/45 focus-visible:ring-offset-2 sm:h-[60px] sm:w-[60px]"
          aria-expanded={isOpen}
          aria-label={isOpen ? "İletişim seçeneklerini kapat" : "İletişim seçeneklerini aç"}
        >
          <span className="absolute inset-1 rounded-full border border-white/12" />
          {isOpen ? (
            <X className="relative h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
          ) : (
            <MessageCircle className="relative h-6 w-6 transition-transform duration-300 group-hover:scale-105" />
          )}
        </button>
      </div>
    </div>
  );
}

function getChannelIcon(type: FloatingContactChannelType) {
  if (type === "instagram") {
    return <Instagram className="h-4 w-4" />;
  }

  if (type === "form") {
    return <MessageSquareText className="h-4 w-4" />;
  }

  return <MessageCircle className="h-4 w-4" />;
}
