"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStoreInfo } from "@/lib/store-info-context";
import {
  getFloatingContactDefaultLabel,
  isFloatingContactExternalHref,
  normalizeFloatingContactSettings,
  resolveFloatingContactHref,
  type FloatingContactChannelType,
} from "@celebix/platform-config/src/floating-contact";
import {
  FloatingIconClose,
  FloatingIconExternal,
  FloatingIconForm,
  FloatingIconInstagram,
  FloatingIconMessage,
  FloatingIconWhatsApp,
} from "@/components/layout/FloatingContactIcons";

const POSITION_CLASSES = {
  "bottom-right": "bottom-5 right-4 sm:bottom-7 sm:right-7",
  "bottom-left": "bottom-5 left-4 sm:bottom-7 sm:left-7",
  "top-right": "top-24 right-6",
  "top-left": "top-24 left-6",
} as const;

type ChannelVisual = {
  pill: string;
  label: string;
  icon: string;
  glow: string;
};

const CHANNEL_VISUALS: Record<FloatingContactChannelType, ChannelVisual> = {
  whatsapp: {
    pill: "shadow-[0_10px_36px_rgba(23,95,53,0.14)] ring-1 ring-[#25D366]/18 hover:ring-[#25D366]/32",
    label: "text-[#1B5E3B]",
    icon: "text-[#1F7A45]",
    glow: "bg-[radial-gradient(circle_at_20%_50%,rgba(37,211,102,0.12),transparent_58%)]",
  },
  instagram: {
    pill: "shadow-[0_10px_36px_rgba(91,36,69,0.14)] ring-1 ring-[#8E3B63]/16 hover:ring-[#8E3B63]/30",
    label: "text-[#5B2445]",
    icon: "text-[#6B2F4E]",
    glow: "bg-[radial-gradient(circle_at_18%_50%,rgba(221,42,123,0.1),transparent_60%)]",
  },
  form: {
    pill: "shadow-[0_10px_36px_rgba(24,17,11,0.12)] ring-1 ring-[#18110B]/10 hover:ring-[#18110B]/22",
    label: "text-[#18110B]",
    icon: "text-[#3D2E22]",
    glow: "bg-[radial-gradient(circle_at_20%_50%,rgba(139,105,20,0.08),transparent_58%)]",
  },
};

const MENU_MOTION = {
  initial: { opacity: 0, y: 14, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.98 },
};

export function FloatingContactButton() {
  const { storeInfo } = useStoreInfo();
  const [isOpen, setIsOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const settings = useMemo(
    () => normalizeFloatingContactSettings(storeInfo?.floatingContact),
    [storeInfo?.floatingContact],
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
            (channel.enabled || channel.href.trim().length > 0) && channel.resolvedHref,
        ),
    [settings.channels],
  );

  const closeMenu = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMenu, isOpen]);

  if (!settings.enabled || channels.length === 0) {
    return null;
  }

  const isBottomPosition = settings.position.startsWith("bottom");
  const transition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className={`pointer-events-none fixed z-40 ${POSITION_CLASSES[settings.position]}`}>
      <div
        className={`pointer-events-auto flex items-end ${
          isBottomPosition ? "flex-col" : "flex-col-reverse"
        }`}
      >
        <div
          className={`flex flex-col gap-2.5 ${isBottomPosition ? "mb-3.5" : "mt-3.5"}`}
          role="menu"
          aria-hidden={!isOpen}
        >
          <AnimatePresence mode="popLayout">
            {isOpen
              ? channels.map((channel, index) => {
                  const label =
                    channel.label || getFloatingContactDefaultLabel(channel.type);
                  const external = isFloatingContactExternalHref(channel.resolvedHref);
                  const visual = CHANNEL_VISUALS[channel.type];

                  return (
                    <motion.a
                      key={channel.type}
                      href={channel.resolvedHref}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noreferrer noopener" : undefined}
                      role="menuitem"
                      onClick={closeMenu}
                      initial={MENU_MOTION.initial}
                      animate={MENU_MOTION.animate}
                      exit={MENU_MOTION.exit}
                      transition={{
                        ...transition,
                        delay: prefersReducedMotion ? 0 : index * 0.055,
                      }}
                      className={`group relative inline-flex min-w-[min(100vw-2rem,236px)] items-center gap-3 overflow-hidden rounded-full bg-white px-4 py-3.5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 sm:min-w-[236px] ${visual.pill}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-0 ${visual.glow}`}
                      />
                      <span
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center ${visual.icon}`}
                      >
                        {getChannelIcon(channel.type)}
                      </span>
                      <span
                        className={`relative min-w-0 flex-1 font-serif text-[15px] leading-none tracking-[-0.01em] ${visual.label}`}
                      >
                        {label}
                      </span>
                      <FloatingIconExternal className="relative shrink-0 text-neutral-400/90 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-neutral-500" />
                    </motion.a>
                  );
                })
              : null}
          </AnimatePresence>
        </div>

        <motion.button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
          className="group relative inline-flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#080808] text-white shadow-[0_18px_44px_rgba(0,0,0,0.34)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A86A]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8F8F8] sm:h-[62px] sm:w-[62px]"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={isOpen ? "İletişim seçeneklerini kapat" : "İletişim seçeneklerini aç"}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-[#A67C3D]/75 transition-colors duration-300 group-hover:border-[#C9A86A]/90"
          />
          <span
            aria-hidden="true"
            className="absolute inset-[4px] rounded-full border border-[#C9A86A]/28 transition-colors duration-300 group-hover:border-[#D4B87A]/45"
          />
          <span
            aria-hidden="true"
            className="absolute inset-[9px] rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.08),transparent_62%)]"
          />

          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              <motion.span
                key="close"
                initial={{ opacity: 0, rotate: -45, scale: 0.85 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 45, scale: 0.85 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.22 }}
                className="relative"
              >
                <FloatingIconClose />
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.22 }}
                className="relative"
              >
                <FloatingIconMessage />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}

function getChannelIcon(type: FloatingContactChannelType) {
  if (type === "instagram") {
    return <FloatingIconInstagram />;
  }

  if (type === "form") {
    return <FloatingIconForm />;
  }

  return <FloatingIconWhatsApp />;
}
