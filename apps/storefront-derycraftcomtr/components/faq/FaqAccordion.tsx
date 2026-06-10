"use client";

import { useId, useState } from "react";
import type { FloatingFaqItem } from "@/lib/floating-faq";

type FaqAccordionProps = {
  items: FloatingFaqItem[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="divide-y divide-[#E8DFD3]">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;

        return (
          <div
            key={`${item.question}-${index}`}
            className={isOpen ? "bg-white/70" : "bg-transparent"}
          >
            <button
              id={buttonId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenIndex((current) => (current === index ? null : index))}
              className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-white/50 sm:gap-4 sm:px-6 sm:py-5"
            >
              <span
                className={`mt-0.5 w-7 shrink-0 font-serif text-sm font-semibold text-[#9A7234] sm:text-[0.9rem] ${
                  isOpen ? "opacity-100" : "opacity-70"
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={`min-w-0 flex-1 text-[0.84rem] font-medium leading-snug sm:text-[0.92rem] ${
                  isOpen ? "text-[#12100D]" : "text-[#3D342C]"
                }`}
              >
                {item.question}
              </span>
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#E8DFD3] text-[#6B5F54] transition ${
                  isOpen
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
                  aria-hidden="true"
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
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 pl-[3.35rem] text-[0.8rem] leading-[1.75] text-[#6B5F54] sm:px-6 sm:pb-6 sm:pl-[3.85rem] sm:text-[0.84rem]">
                  {item.answer}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
