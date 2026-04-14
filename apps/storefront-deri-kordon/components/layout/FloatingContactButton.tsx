"use client";

import { useMemo, useState, useCallback } from "react";
import {
  ExternalLink,
  Instagram,
  MessageCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
            (channel.enabled || channel.href.trim().length > 0) &&
            channel.resolvedHref
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
    <div
      className={`pointer-events-none fixed z-50 ${POSITION_CLASSES[settings.position]}`}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[-1] bg-neutral-950/10 backdrop-blur-[2px]"
            onClick={closeMenu}
          />
        )}
      </AnimatePresence>

      <div
        className={`pointer-events-auto flex items-end ${
          isBottomPosition ? "flex-col" : "flex-col-reverse"
        }`}
      >
        <div
          className={`flex flex-col gap-2 ${
            isBottomPosition ? "mb-3" : "mt-3"
          }`}
        >
          <AnimatePresence mode="popLayout">
            {isOpen
              ? channels.map((channel, index) => {
                  const label =
                    channel.label || getFloatingContactDefaultLabel(channel.type);
                  const external = isFloatingContactExternalHref(
                    channel.resolvedHref
                  );

                  return (
                    <motion.a
                      key={channel.type}
                      href={channel.resolvedHref}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noreferrer noopener" : undefined}
                      initial={{ opacity: 0, y: isBottomPosition ? 20 : -20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: isBottomPosition ? 10 : -10, scale: 0.95 }}
                      transition={{
                        duration: 0.35,
                        delay: index * 0.06,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      onClick={closeMenu}
                      className={`group relative inline-flex min-w-[200px] items-center justify-between gap-3 overflow-hidden rounded-[22px] px-4 py-3.5 text-[13px] font-semibold tracking-[-0.01em] shadow-[0_14px_42px_-14px_rgba(0,0,0,0.35)] transition-all duration-300 hover:shadow-[0_20px_50px_-16px_rgba(0,0,0,0.45)] hover:scale-[1.02] active:scale-[0.98] ${getChannelStyles(channel.type)}`}
                    >
                      <span className="relative z-10 inline-flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                          {getChannelIcon(channel.type)}
                        </span>
                        <span className="relative top-px">{label}</span>
                      </span>
                      <ExternalLink className="relative z-10 h-3.5 w-3.5 opacity-70 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />

                      {channel.type === "whatsapp" && (
                        <span className="absolute inset-0 bg-gradient-to-br from-[#25D366] via-[#128C7E] to-[#075E54] opacity-100 transition-opacity duration-300 group-hover:opacity-90" />
                      )}
                      {channel.type === "instagram" && (
                        <span className="absolute inset-0 bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737] opacity-100 transition-opacity duration-300 group-hover:opacity-90" />
                      )}
                      {channel.type === "form" && (
                        <span className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black opacity-100 transition-opacity duration-300 group-hover:opacity-95" />
                      )}
                    </motion.a>
                  );
                })
              : null}
          </AnimatePresence>
        </div>

        <motion.button
          type="button"
          onClick={toggleOpen}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-white/90 px-4 py-3.5 text-[13px] font-semibold text-neutral-800 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.9)] ring-1 ring-neutral-200/60 backdrop-blur-xl transition-all duration-300 hover:bg-white hover:shadow-[0_16px_48px_-14px_rgba(0,0,0,0.3)] hover:ring-neutral-300/60"
          aria-expanded={isOpen}
          aria-label={isOpen ? "İletişim seçeneklerini kapat" : "İletişim seçeneklerini aç"}
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 transition-colors duration-300 group-hover:bg-neutral-200">
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.span
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-4 w-4 text-neutral-700" />
                </motion.span>
              ) : (
                <motion.span
                  key="open"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <MessageCircle className="h-4 w-4 text-neutral-700" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>

          <span className="relative hidden pr-1 sm:inline">
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.span
                  key="close-text"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="inline-block tracking-[-0.01em]"
                >
                  Kapat
                </motion.span>
              ) : (
                <motion.span
                  key="open-text"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="inline-block tracking-[-0.01em]"
                >
                  İletişim
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </motion.button>
      </div>
    </div>
  );
}

function getChannelStyles(type: FloatingContactChannelType): string {
  switch (type) {
    case "whatsapp":
      return "text-white";
    case "instagram":
      return "text-white";
    case "form":
      return "text-white";
    default:
      return "text-white";
  }
}

function getChannelIcon(type: FloatingContactChannelType) {
  const iconClass = "h-3.5 w-3.5";

  switch (type) {
    case "instagram":
      return <Instagram className={iconClass} />;
    case "form":
      return <MessageSquareText className={iconClass} />;
    case "whatsapp":
    default:
      return <MessageCircle className={iconClass} />;
  }
}
