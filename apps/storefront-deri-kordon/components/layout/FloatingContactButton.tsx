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
  whatsapp: "bg-[#25D366] text-white hover:bg-[#1faa52]",
  instagram:
    "bg-[linear-gradient(135deg,#F58529,#FEDA77,#DD2A7B,#8134AF,#515BD4)] text-white hover:brightness-95",
  form: "bg-neutral-900 text-white hover:bg-neutral-800",
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
        .filter((channel) => channel.enabled && channel.resolvedHref),
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
                    className={`group inline-flex min-w-[220px] items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all ${CHANNEL_STYLES[channel.type]}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {getChannelIcon(channel.type)}
                      {label}
                    </span>
                    <ExternalLink className="h-4 w-4 opacity-80 transition group-hover:translate-x-0.5" />
                  </a>
                );
              })
            : null}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-neutral-800"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Iletisim seceneklerini kapat" : "Iletisim seceneklerini ac"}
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          <span className="hidden sm:inline">{isOpen ? "Kapat" : "Iletisim"}</span>
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
