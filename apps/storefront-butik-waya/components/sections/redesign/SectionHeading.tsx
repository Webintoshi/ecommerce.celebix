"use client";

import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  label?: string;
  className?: string;
}

export function SectionHeading({ label, className }: SectionHeadingProps) {
  if (!label) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <span aria-hidden className="h-px w-10 bg-[rgba(26,26,26,0.16)]" />
      <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.26em] text-[#1d1715] sm:text-[0.82rem]">
        {label}
      </h2>
    </div>
  );
}
