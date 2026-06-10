import { cn } from "@/lib/utils";

/** Square-corner CTA styles aligned with homepage hero banner buttons. */
export const PDP_PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 border border-[#8A6B37] bg-[#8A6B37] px-8 py-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition-colors hover:border-[#755a2d] hover:bg-[#755a2d] disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-200 disabled:text-neutral-400";

export const PDP_OUTLINE_BUTTON =
  "inline-flex items-center justify-center gap-2 border border-[#E8DFD3] bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#12100D] transition-colors hover:border-[#C4A062] hover:text-[#8A6B37] disabled:cursor-not-allowed disabled:opacity-50";

export function pdpOptionButtonClass({
  selected,
  disabled = false,
}: {
  selected: boolean;
  disabled?: boolean;
}) {
  return cn(
    "relative border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
    selected
      ? "border-[#8A6B37] bg-[#8A6B37] text-white"
      : disabled
        ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
        : "border-[#E8DFD3] bg-white text-[#12100D] hover:border-[#C4A062]",
  );
}

export const PDP_SELECTED_VALUE_CHIP =
  "border border-[#E8DFD3] bg-[#FAF7F2] px-2.5 py-1 text-sm font-semibold text-[#3D342C]";

export const PDP_BADGE =
  "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]";
