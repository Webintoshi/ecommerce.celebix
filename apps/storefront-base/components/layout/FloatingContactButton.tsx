"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ExternalLink,
  Instagram,
  MessageCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useStoreInfo } from "@/lib/store-info-context";
import {
  getFloatingContactDefaultLabel,
  isFloatingContactExternalHref,
  normalizeFloatingContactSettings,
  resolveFloatingContactHref,
  type FloatingContactChannelType,
} from "@celebix/platform-config/src/floating-contact";

const POSITION_CLASSES = {
  "bottom-right": "bottom-4 right-4 sm:bottom-6 sm:right-6",
  "bottom-left": "bottom-4 left-4 sm:bottom-6 sm:left-6",
  "top-right": "top-20 right-4 sm:top-24 sm:right-6",
  "top-left": "top-20 left-4 sm:top-24 sm:left-6",
} as const;

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
        .filter(
          (channel) =>
            (channel.enabled || channel.href.trim().length > 0) && channel.resolvedHref
        ),
    [settings.channels]
  );

  const toggleOpen = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (!settings.enabled || channels.length === 0) {
    return null;
  }

  const isBottomPosition = settings.position.startsWith("bottom");

  return (
    <div className={`pointer-events-none fixed z-50 ${POSITION_CLASSES[settings.position]}`}>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[-1] bg-neutral-950/8 backdrop-blur-[2px]"
            onClick={closeMenu}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] ${
          isBottomPosition ? "flex-col items-end" : "flex-col-reverse items-end"
        }`}
      >
        <AnimatePresence>
          {isOpen ? (
            <motion.div
              initial={{ opacity: 0, y: isBottomPosition ? 14 : -14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isBottomPosition ? 10 : -10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className={`w-[min(17.5rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-[#d6bd9d]/60 bg-[linear-gradient(180deg,rgba(255,250,243,0.95),rgba(246,235,217,0.94))] p-1.5 shadow-[0_22px_54px_-22px_rgba(64,43,18,0.24)] ring-1 ring-white/70 backdrop-blur-xl ${
                isBottomPosition ? "mb-3" : "mt-3"
              }`}
            >
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#c69559]/72 to-transparent" />
              <div className="flex flex-col gap-2">
                {channels.map((channel, index) => {
                  const label = channel.label || getFloatingContactDefaultLabel(channel.type);
                  const external = isFloatingContactExternalHref(channel.resolvedHref);

                  return (
                    <motion.a
                      key={channel.type}
                      href={channel.resolvedHref}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noreferrer noopener" : undefined}
                      onClick={closeMenu}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ delay: index * 0.04, duration: 0.2 }}
                      className="group flex items-center gap-3 rounded-[16px] border border-[#d3b895]/45 bg-white/72 px-3.5 py-2.5 text-[#2f2419] shadow-[0_10px_24px_-20px_rgba(64,43,18,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c9aa82]/65 hover:bg-white/84"
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getChannelAccent(channel.type)}`}>
                        {getChannelIcon(channel.type)}
                      </span>

                      <span className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold tracking-[-0.02em]">
                        {label}
                      </span>

                      <ExternalLink className="h-4 w-4 shrink-0 text-[#a28764] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#7f6038]" />
                    </motion.a>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={toggleOpen}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="group relative inline-flex h-[3rem] items-center gap-2.5 overflow-hidden rounded-full border border-[#b98954]/55 bg-[linear-gradient(135deg,rgba(188,138,79,0.96),rgba(128,86,47,0.96))] px-3.5 pr-4 text-white shadow-[0_18px_36px_-20px_rgba(79,49,20,0.45)] ring-1 ring-white/20 backdrop-blur-xl transition-all duration-300 hover:shadow-[0_24px_46px_-22px_rgba(79,49,20,0.5)]"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Iletisim seceneklerini kapat" : "Iletisim seceneklerini ac"}
        >
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.36),transparent_62%)] opacity-100" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-white/25">
            <AnimatePresence mode="wait" initial={false}>
              {isOpen ? (
                <motion.span
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <X className="h-4 w-4" />
                </motion.span>
              ) : (
                <motion.span
                  key="open"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <MessageCircle className="h-4 w-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>

          <span className="relative text-[15px] font-semibold tracking-[-0.02em] text-white">
            {isOpen ? "Kapat" : "Iletisim"}
          </span>
        </motion.button>
      </div>
    </div>
  );
}

function getChannelAccent(type: FloatingContactChannelType): string {
  switch (type) {
    case "whatsapp":
      return "bg-[#25D366]/18 text-[#1e9b4c]";
    case "instagram":
      return "bg-[linear-gradient(135deg,rgba(131,58,180,0.14),rgba(253,29,29,0.12),rgba(247,119,55,0.12))] text-[#b2368e]";
    case "form":
      return "bg-[#8b5a2b]/14 text-[#7b4c1d]";
    default:
      return "bg-[#8b5a2b]/14 text-[#7b4c1d]";
  }
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
