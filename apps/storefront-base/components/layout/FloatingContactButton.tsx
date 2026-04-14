"use client";

import { useMemo, useState, useCallback } from "react";
import {
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
  "bottom-right": "bottom-5 right-5 sm:bottom-6 sm:right-6",
  "bottom-left": "bottom-5 left-5 sm:bottom-6 sm:left-6",
  "top-right": "top-20 right-5 sm:top-24 sm:right-6",
  "top-left": "top-20 left-5 sm:top-24 sm:left-6",
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
  const isRightPosition = settings.position.endsWith("right");

  // Calculate positions for channels in a fan arc
  const getChannelPosition = (index: number, total: number) => {
    const spacing = 58;
    const angleStep = 52;
    const startAngle = isBottomPosition ? -90 : 90;
    const direction = isRightPosition ? -1 : 1;
    const angleOffset = ((total - 1) / 2 - index) * angleStep * direction;
    const rad = ((startAngle + angleOffset) * Math.PI) / 180;
    return {
      x: Math.cos(rad) * spacing,
      y: Math.sin(rad) * spacing,
    };
  };

  return (
    <div className={`pointer-events-none fixed z-50 ${POSITION_CLASSES[settings.position]}`}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[-1] bg-neutral-950/6"
            onClick={closeMenu}
          />
        )}
      </AnimatePresence>

      <div className="pointer-events-auto relative flex items-center justify-center">
        {/* Channel Icons */}
        <AnimatePresence>
          {isOpen &&
            channels.map((channel, index) => {
              const pos = getChannelPosition(index, channels.length);
              const external = isFloatingContactExternalHref(channel.resolvedHref);
              const label = channel.label || getFloatingContactDefaultLabel(channel.type);

              return (
                <motion.div
                  key={channel.type}
                  initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                  animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
                  exit={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: index * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="absolute"
                >
                  <a
                    href={channel.resolvedHref}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer noopener" : undefined}
                    onClick={closeMenu}
                    onMouseEnter={() => setHoveredChannel(channel.type)}
                    onMouseLeave={() => setHoveredChannel(null)}
                    className={`group relative flex h-[46px] w-[46px] items-center justify-center rounded-full shadow-[0_12px_28px_-10px_rgba(0,0,0,0.45)] ring-1 ring-white/25 transition-all duration-300 hover:scale-110 hover:shadow-[0_16px_34px_-12px_rgba(0,0,0,0.5)] ${getChannelBg(channel.type)}`}
                    aria-label={label}
                  >
                    <span className="relative z-10">{getChannelIcon(channel.type)}</span>
                  </a>

                  {/* Tooltip */}
                  <AnimatePresence>
                    {hoveredChannel === channel.type && (
                      <motion.span
                        initial={{ opacity: 0, x: isRightPosition ? 8 : -8, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: isRightPosition ? 6 : -6, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={`pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900/92 px-2 py-1 text-[11px] font-medium text-white shadow-lg ring-1 ring-white/10 ${
                          isRightPosition ? "right-full mr-2" : "left-full ml-2"
                        }`}
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
        </AnimatePresence>

        {/* Main Trigger Button */}
        <motion.button
          type="button"
          onClick={toggleOpen}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative z-10 flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[linear-gradient(145deg,#c9a66b,#9e7a4a)] shadow-[0_14px_34px_-14px_rgba(79,55,28,0.55),inset_0_1px_1px_rgba(255,255,255,0.35)] ring-1 ring-white/30 transition-all duration-300 hover:shadow-[0_18px_42px_-16px_rgba(79,55,28,0.62)]"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Iletisim seceneklerini kapat" : "Iletisim seceneklerini ac"}
        >
          {/* Inner glow */}
          <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.45),transparent_60%)]" />
          
          {/* Shine line */}
          <span className="pointer-events-none absolute inset-x-3 top-[10px] h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent" />

          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              <motion.span
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative text-white"
              >
                <X className="h-[22px] w-[22px]" strokeWidth={2} />
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative text-white"
              >
                <MessageCircle className="h-[24px] w-[24px]" strokeWidth={1.75} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}

function getChannelBg(type: FloatingContactChannelType): string {
  switch (type) {
    case "whatsapp":
      return "bg-[#25D366] text-white";
    case "instagram":
      return "bg-[linear-gradient(135deg,#F58529,#FEDA77,#DD2A7B,#8134AF,#515BD4)] text-white";
    case "form":
      return "bg-neutral-900 text-white";
    default:
      return "bg-neutral-900 text-white";
  }
}

function getChannelIcon(type: FloatingContactChannelType) {
  const cls = "h-5 w-5";
  switch (type) {
    case "instagram":
      return <Instagram className={cls} strokeWidth={1.75} />;
    case "form":
      return <MessageSquareText className={cls} strokeWidth={1.75} />;
    case "whatsapp":
    default:
      return <MessageCircle className={cls} strokeWidth={1.75} />;
  }
}
