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
  "bottom-right": "bottom-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "top-right": "top-24 right-6",
  "top-left": "top-24 left-6",
} as const;

const CHANNEL_STYLES: Record<FloatingContactChannelType, string> = {
  whatsapp:
    "border border-[rgba(37,211,102,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(241,252,245,0.98)_100%)] text-[#14803d] hover:border-[rgba(37,211,102,0.34)]",
  instagram:
    "border border-[rgba(221,42,123,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(252,243,248,0.98)_100%)] text-[#9d174d] hover:border-[rgba(221,42,123,0.28)]",
  form: "border border-[rgba(80,94,113,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,246,246,0.98)_100%)] text-[var(--store-ink)] hover:border-[rgba(218,99,13,0.22)]",
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
                    className={`group inline-flex min-w-[214px] items-center justify-between gap-3 rounded-[24px] px-4 py-3 text-sm font-semibold shadow-[0_20px_42px_-32px_rgba(80,94,113,0.38)] backdrop-blur-xl transition-all hover:-translate-y-0.5 ${CHANNEL_STYLES[channel.type]}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/88 text-current shadow-[0_10px_24px_-18px_rgba(80,94,113,0.35)]">
                        {getChannelIcon(channel.type)}
                      </span>
                      {label}
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/78 text-current shadow-[0_10px_24px_-20px_rgba(80,94,113,0.32)] transition group-hover:translate-x-0.5">
                      <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                    </span>
                  </a>
                );
              })
            : null}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex items-center gap-2.5 rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,246,246,0.96)_100%)] px-3.5 py-3 text-[13px] font-semibold tracking-[0.02em] text-[var(--store-ink)] shadow-[0_24px_48px_-30px_rgba(80,94,113,0.40)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[rgba(218,99,13,0.20)]"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Iletisim seceneklerini kapat" : "Iletisim seceneklerini ac"}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(218,99,13,0.10)] text-[var(--store-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            {isOpen ? <X className="h-4.5 w-4.5" /> : <MessageCircle className="h-4.5 w-4.5" />}
          </span>
          <span>{isOpen ? "Kapat" : "Iletisim"}</span>
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
