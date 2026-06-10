"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStoreInfo } from "@/lib/store-info-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import {
  DEFAULT_FLOATING_FAQ_ITEMS,
  type FloatingFaqItem,
} from "@/lib/floating-faq";
import {
  getFloatingContactDefaultLabel,
  getFloatingContactButtonHoverColor,
  getFloatingContactButtonShadowRgba,
  isFloatingContactExternalHref,
  normalizeFloatingContactSettings,
  resolveFloatingContactHref,
} from "@celebix/platform-config/src/floating-contact";
import {
  FloatingFaqChatIcon,
  FloatingIconClose,
} from "@/components/layout/FloatingContactIcons";

const POSITION_CLASSES = {
  "bottom-right": "bottom-5 right-4 sm:bottom-7 sm:right-7",
  "bottom-left": "bottom-5 left-4 sm:bottom-7 sm:left-7",
  "top-right": "top-24 right-6",
  "top-left": "top-24 left-6",
} as const;

const PANEL_MOTION = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.98 },
};

const FLOATING_BUTTON_COLOR = "#8A6B37";

export function FloatingContactButton() {
  const { storeInfo } = useStoreInfo();
  const { buildPath } = useStorefrontRoute();
  const [isOpen, setIsOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [faqItems, setFaqItems] = useState<FloatingFaqItem[]>(DEFAULT_FLOATING_FAQ_ITEMS);
  const prefersReducedMotion = useReducedMotion();

  const settings = useMemo(
    () => normalizeFloatingContactSettings(storeInfo?.floatingContact),
    [storeInfo?.floatingContact],
  );

  const buttonColor = FLOATING_BUTTON_COLOR;
  const buttonHoverColor = useMemo(
    () => getFloatingContactButtonHoverColor(buttonColor),
    [buttonColor],
  );
  const buttonShadow = useMemo(
    () => getFloatingContactButtonShadowRgba(buttonColor, 0.42),
    [buttonColor],
  );
  const buttonShadowHover = useMemo(
    () => getFloatingContactButtonShadowRgba(buttonColor, 0.5),
    [buttonColor],
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
            channel.resolvedHref,
        ),
    [settings.channels],
  );

  const sssHref = buildPath("/sss");
  const transition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const };

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setOpenFaqIndex(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFaqItems() {
      try {
        const response = await fetch("/api/floating-faq", { cache: "no-store" });
        const data = await response.json();

        if (!cancelled && data?.success && Array.isArray(data.items) && data.items.length > 0) {
          setFaqItems(data.items);
        }
      } catch (error) {
        console.error("Failed to fetch floating FAQ items:", error);
      }
    }

    loadFaqItems();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closePanel, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!settings.enabled) {
    return null;
  }

  const isBottomPosition = settings.position.startsWith("bottom");
  const alignmentClass =
    settings.position.endsWith("left") ? "items-start" : "items-end";

  return (
    <>
      <AnimatePresence>
        {isOpen ? (
          <motion.button
            type="button"
            aria-label="Paneli kapat"
            className="fixed inset-0 z-40 bg-[#12100d]/22 backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={closePanel}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={`pointer-events-none fixed z-50 ${POSITION_CLASSES[settings.position]} ${alignmentClass} flex flex-col`}
      >
        <div className="pointer-events-auto flex w-full flex-col items-end gap-3">
          <AnimatePresence>
            {isOpen ? (
              <motion.section
                id="floating-faq-panel"
                key="floating-faq-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Sıkça sorulan sorular"
                initial={PANEL_MOTION.initial}
                animate={PANEL_MOTION.animate}
                exit={PANEL_MOTION.exit}
                transition={transition}
                className={`w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-[#E8DFD3] bg-[#FAF7F2] shadow-[0_32px_80px_rgba(18,16,13,0.16),0_8px_24px_rgba(18,16,13,0.06)] ${
                  isBottomPosition ? "order-1" : "order-2"
                }`}
              >
                <div className="h-px bg-gradient-to-r from-transparent via-[#C4A062] to-transparent" />

                <div className="relative border-b border-[#E8DFD3] bg-white px-6 pb-4 pt-6">
                  <button
                    type="button"
                    onClick={closePanel}
                    aria-label="Kapat"
                    className="absolute right-4 top-4 grid h-[34px] w-[34px] place-items-center rounded-full border border-[#E8DFD3] bg-[#FAF7F2] text-[#6B5F54] transition hover:border-[#9A7234] hover:text-[#12100D]"
                  >
                    <FloatingIconClose size={12} />
                  </button>

                  <p className="text-[0.58rem] font-medium uppercase tracking-[0.3em] text-[#9A7234]">
                    Yardım merkezi
                  </p>
                  <h2 className="mt-2 font-serif text-[1.65rem] font-semibold leading-tight tracking-[-0.02em] text-[#12100D]">
                    Sıkça sorulan sorular
                  </h2>
                  <p className="mt-2 max-w-[28ch] text-[0.76rem] leading-relaxed text-[#6B5F54]">
                    Sipariş, teslimat ve ürünlerimiz hakkında merak ettikleriniz.
                  </p>
                </div>

                <ul className="max-h-[min(52vh,400px)] overflow-y-auto overscroll-contain">
                  {faqItems.map((item, index) => {
                    const isFaqOpen = openFaqIndex === index;

                    return (
                      <li
                        key={`${item.question}-${index}`}
                        className={`border-b border-[#E8DFD3] last:border-b-0 ${
                          isFaqOpen ? "bg-white/65" : ""
                        }`}
                      >
                        <button
                          type="button"
                          aria-expanded={isFaqOpen}
                          onClick={() =>
                            setOpenFaqIndex((current) =>
                              current === index ? null : index,
                            )
                          }
                          className="flex w-full items-start gap-3 px-6 py-4 text-left transition hover:text-[#12100D]"
                        >
                          <span
                            className={`mt-px w-[22px] shrink-0 font-serif text-[0.85rem] font-semibold text-[#9A7234] ${
                              isFaqOpen ? "opacity-100" : "opacity-70"
                            }`}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`min-w-0 flex-1 text-[0.78rem] font-medium leading-snug ${
                              isFaqOpen ? "text-[#12100D]" : "text-[#3D342C]"
                            }`}
                          >
                            {item.question}
                          </span>
                          <span
                            className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#E8DFD3] text-[#6B5F54] transition ${
                              isFaqOpen
                                ? "rotate-180 border-[#12100D] bg-[#12100D] text-white"
                                : ""
                            }`}
                          >
                            <svg
                              viewBox="0 0 12 12"
                              className="h-2.5 w-2.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path
                                d="M3 4.5 6 7.5 9 4.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </button>

                        <div
                          className={`overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            isFaqOpen ? "max-h-64" : "max-h-0"
                          }`}
                        >
                          <div className="px-6 pb-4 pl-[3.55rem] text-[0.74rem] leading-[1.7] text-[#6B5F54]">
                            {item.answer}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8DFD3] bg-white px-6 py-4">
                  <Link
                    href={sssHref}
                    onClick={closePanel}
                    className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-[#12100D] underline decoration-[#12100D] underline-offset-[3px] transition hover:text-[#9A7234] hover:decoration-[#9A7234]"
                  >
                    Tüm SSS sayfası
                  </Link>

                  <div className="flex flex-wrap items-center gap-3">
                    {channels.map((channel) => {
                      const label =
                        channel.label || getFloatingContactDefaultLabel(channel.type);
                      const external = isFloatingContactExternalHref(channel.resolvedHref);

                      return (
                        <a
                          key={channel.type}
                          href={channel.resolvedHref}
                          target={external ? "_blank" : undefined}
                          rel={external ? "noreferrer noopener" : undefined}
                          onClick={closePanel}
                          className="text-[0.62rem] font-medium uppercase tracking-[0.12em] text-[#6B5F54] transition hover:text-[#1A5C36]"
                        >
                          {label}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </motion.section>
            ) : null}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            aria-expanded={isOpen}
            aria-controls="floating-faq-panel"
            aria-label={isOpen ? "Paneli kapat" : "Sıkça sorulan soruları aç"}
            className={`relative grid h-[64px] w-[64px] place-items-center rounded-full text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12100D]/25 focus-visible:ring-offset-2 ${
              isBottomPosition ? "order-2" : "order-1"
            }`}
            style={{
              backgroundColor: isOpen ? buttonHoverColor : buttonColor,
              boxShadow: isOpen
                ? `0 12px 32px ${buttonShadowHover}`
                : `0 8px 24px ${buttonShadow}`,
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isOpen ? (
                <motion.span
                  key="close"
                  initial={{ opacity: 0, rotate: -45, scale: 0.85 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 45, scale: 0.85 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.22 }}
                >
                  <FloatingIconClose size={22} />
                </motion.span>
              ) : (
                <motion.span
                  key="open"
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.88 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.22 }}
                >
                  <FloatingFaqChatIcon size={32} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </>
  );
}
