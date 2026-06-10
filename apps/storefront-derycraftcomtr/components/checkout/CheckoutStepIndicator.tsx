"use client";

import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckoutStepIndicatorProps = {
  currentStep: 1 | 2;
  onDeliveryClick?: () => void;
};

export function CheckoutStepIndicator({
  currentStep,
  onDeliveryClick,
}: CheckoutStepIndicatorProps) {
  return (
    <nav
      aria-label="Ödeme adımları"
      className="flex items-center gap-2 sm:gap-3"
    >
      <button
        type="button"
        onClick={onDeliveryClick}
        disabled={currentStep === 1}
        className={cn(
          "flex items-center gap-2 transition-colors",
          currentStep === 1
            ? "cursor-default text-[#12100D]"
            : "cursor-pointer text-neutral-500 hover:text-[#8A6B37]",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
            currentStep === 1
              ? "bg-[#8A6B37] text-white"
              : "bg-[#F0F7F2] text-[#8A6B37]",
          )}
        >
          {currentStep > 1 ? <Check className="h-3.5 w-3.5" /> : "1"}
        </span>
        <span className="hidden text-[11px] font-semibold uppercase tracking-[0.16em] sm:inline">
          Teslimat
        </span>
      </button>

      <ChevronRight className="h-4 w-4 text-[#E8DFD3]" strokeWidth={1.75} />

      <div
        className={cn(
          "flex items-center gap-2",
          currentStep === 2 ? "text-[#12100D]" : "text-neutral-400",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
            currentStep === 2
              ? "bg-[#8A6B37] text-white"
              : "bg-[#FAF7F2] text-neutral-400",
          )}
        >
          2
        </span>
        <span className="hidden text-[11px] font-semibold uppercase tracking-[0.16em] sm:inline">
          Ödeme
        </span>
      </div>
    </nav>
  );
}
