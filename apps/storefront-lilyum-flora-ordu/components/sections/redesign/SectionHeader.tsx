"use client";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  action,
  className,
}: SectionHeaderProps) {
  const isCentered = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        isCentered && "mx-auto max-w-3xl text-center sm:flex-col sm:items-center",
        className,
      )}
    >
      <div className={cn("max-w-3xl", isCentered && "mx-auto")}>
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <h2 className="section-title mt-3">{title}</h2>
        {description ? <p className="section-copy mt-4">{description}</p> : null}
      </div>
      {action ? <div className={cn(isCentered && "sm:pt-3")}>{action}</div> : null}
    </div>
  );
}
