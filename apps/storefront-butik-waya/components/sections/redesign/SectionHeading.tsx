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
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3", className)}>
      <span aria-hidden className="h-px w-10 bg-[rgba(26,26,26,0.16)] sm:w-12" />
      <h2 className="font-serif text-[2rem] leading-[0.94] tracking-[-0.045em] text-[#1d1715] sm:text-[2.45rem] lg:text-[3.2rem]">
        {label}
      </h2>
    </div>
  );
}
