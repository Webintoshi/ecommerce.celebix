"use client";

import { useCallback, useMemo, useState } from "react";
import { Instagram, MessageCircle, MessageSquareText, X } from "lucide-react";
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
  "bottom-right": "bottom-6 right-6 sm:bottom-8 sm:right-8",
  "bottom-left": "bottom-6 left-6 sm:bottom-8 sm:left-8",
  "top-right": "top-20 right-6 sm:top-24 sm:right-8",
  "top-left": "top-20 left-6 sm:top-24 sm:left-8",
} as const;

export function FloatingContactButton() {
  const { storeInfo } = useStoreInfo();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);
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
    setHoveredChannel(null);
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
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[-1] bg-black/8 backdrop-blur-[1px]"
            onClick={closeMenu}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={`pointer-events-auto relative flex items-center ${
          isBottomPosition ? "flex-col" : "flex-col-reverse"
        }`}
      >
        <AnimatePresence>
          {isOpen ? (
            <motion.div
              initial={{ opacity: 0, y: isBottomPosition ? 10 : -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isBottomPosition ? 10 : -10, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className={`mb-3 flex items-center gap-2 rounded-full border border-[#d6c9b6] bg-white/96 p-2 shadow-[0_20px_40px_-22px_rgba(20,20,20,0.35)] backdrop-blur-xl ${
                isBottomPosition ? "mb-3" : "mt-3"
              }`}
            >
              {channels.map((channel, index) => {
                const external = isFloatingContactExternalHref(channel.resolvedHref);
                const label = channel.label || getFloatingContactDefaultLabel(channel.type);

                return (
                  <motion.a
                    key={channel.type}
                    href={channel.resolvedHref}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer noopener" : undefined}
                    onClick={closeMenu}
                    onMouseEnter={() => setHoveredChannel(channel.type)}
                    onMouseLeave={() => setHoveredChannel(null)}
                    initial={{ opacity: 0, y: 8, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.92 }}
                    transition={{ duration: 0.2, delay: index * 0.04 }}
                    className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:text-neutral-900"
                    aria-label={label}
                  >
                    {getChannelIcon(channel.type)}

                    <AnimatePresence>
                      {hoveredChannel === channel.type ? (
                        <motion.span
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.14 }}
                          className="pointer-events-none absolute -top-9 hidden whitespace-nowrap rounded-lg bg-[#0f0f10] px-2 py-1 text-[11px] font-medium text-white shadow-xl sm:block"
                        >
                          {label}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </motion.a>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={toggleOpen}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="relative z-10 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[linear-gradient(145deg,#0f1012,#191c20)] text-white shadow-[0_16px_34px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/10 transition-all duration-300 hover:shadow-[0_22px_42px_-18px_rgba(0,0,0,0.62)]"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Iletisim seceneklerini kapat" : "Iletisim seceneklerini ac"}
        >
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_28%_22%,rgba(255,255,255,0.22),transparent_58%)]" />

          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              <motion.span
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <X className="h-6 w-6" strokeWidth={1.7} />
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <MessageSquareText className="h-6 w-6" strokeWidth={1.7} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}

function getChannelIcon(type: FloatingContactChannelType) {
  const common = "h-[20px] w-[20px] transition-colors duration-200";

  if (type === "instagram") {
    return <Instagram className={`${common} text-[#be3e83] group-hover:text-[#a02f6d]`} strokeWidth={1.8} />;
  }

  if (type === "whatsapp") {
    return <MessageCircle className={`${common} text-[#1cab5f] group-hover:text-[#15924f]`} strokeWidth={1.8} />;
  }

  return <MessageSquareText className={`${common} text-neutral-600 group-hover:text-neutral-900`} strokeWidth={1.8} />;
}
