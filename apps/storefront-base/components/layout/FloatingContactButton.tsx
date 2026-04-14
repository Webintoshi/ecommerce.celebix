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
    return (
      <svg 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={`${common} text-[#1cab5f] group-hover:text-[#15924f]`}
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.305-.885-.653-1.48-1.459-1.653-1.756-.173-.298-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    );
  }

  return <MessageSquareText className={`${common} text-neutral-600 group-hover:text-neutral-900`} strokeWidth={1.8} />;
}
