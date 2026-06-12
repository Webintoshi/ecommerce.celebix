"use client";

import { cn } from "@/lib/utils";

interface MarqueeProps {
  className?: string;
  children?: React.ReactNode;
}

export function Marquee({ className, children }: MarqueeProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="flex animate-marquee whitespace-nowrap">
        {children}
      </div>
    </div>
  );
}
