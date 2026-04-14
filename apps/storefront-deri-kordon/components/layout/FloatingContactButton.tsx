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
              className={`w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-[#5a4c3f]/45 bg-[linear-gradient(180deg,rgba(31,27,23,0.94),rgba(18,16,13,0.98))] p-1.5 shadow-[0_28px_64px_-24px_rgba(0,0,0,0.52)] ring-1 ring-white/5 backdrop-blur-2xl ${
                isBottomPosition ? "mb-3" : "mt-3"
              }`}
            >
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#bb8c4a]/70 to-transparent" />
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
                      className="group flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.04] px-3.5 py-3 text-white shadow-[0_10px_24px_-18px_rgba(0,0,0,0.42)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/14 hover:bg-white/[0.06]"
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getChannelAccent(channel.type)}`}>
                        {getChannelIcon(channel.type)}
                      </span>

                      <span className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold tracking-[-0.02em]">
                        {label}
                      </span>

                      <ExternalLink className="h-4 w-4 shrink-0 text-white/45 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white/82" />
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
          className="group relative inline-flex h-[3.25rem] items-center gap-3 overflow-hidden rounded-full border border-[#5d4f42]/50 bg-[linear-gradient(180deg,rgba(36,31,26,0.96),rgba(20,18,15,0.98))] px-4 pr-[1.125rem] text-white shadow-[0_18px_38px_-18px_rgba(0,0,0,0.5)] ring-1 ring-white/5 backdrop-blur-xl transition-all duration-300 hover:shadow-[0_24px_50px_-22px_rgba(0,0,0,0.56)]"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Iletisim seceneklerini kapat" : "Iletisim seceneklerini ac"}
        >
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_60%)] opacity-100" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/10">
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
      return "bg-[#25D366]/18 text-[#7ef0ae]";
    case "instagram":
      return "bg-[linear-gradient(135deg,rgba(131,58,180,0.2),rgba(253,29,29,0.18),rgba(247,119,55,0.16))] text-[#ffb0d7]";
    case "form":
      return "bg-white/10 text-white/85";
    default:
      return "bg-white/10 text-white/85";
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
