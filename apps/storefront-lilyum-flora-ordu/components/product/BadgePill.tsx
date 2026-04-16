"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "soft" | "solid" | "outline";

interface BadgePillProps {
  label?: string;
  children?: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  soft: "border border-[var(--store-border-strong)] bg-[var(--store-surface-alt)] text-[var(--store-ink)]",
  solid: "border border-[var(--store-accent)] bg-[var(--store-accent)] text-white",
  outline: "border border-[var(--store-border-strong)] bg-white text-[var(--store-ink)]",
};

export function BadgePill({
  label,
  children,
  tone = "soft",
  className,
}: BadgePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
        toneClasses[tone],
        className,
      )}
    >
      {children || label}
    </span>
  );
}
