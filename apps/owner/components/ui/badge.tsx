import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "info" | "accent";
  size?: "sm" | "md";
}

function Badge({ className, variant = "default", size = "md", children, ...props }: BadgeProps) {
  const variants = {
    default: "bg-[var(--surface-3)] text-[var(--text-secondary)] border-[var(--border-default)]",
    success: "bg-[var(--status-success-soft)] text-[var(--status-success)] border-[var(--status-success-border)]",
    warning: "bg-[var(--status-warning-soft)] text-[var(--status-warning)] border-[var(--status-warning-border)]",
    error: "bg-[var(--status-danger-soft)] text-[var(--status-danger)] border-[var(--status-danger-border)]",
    info: "bg-[var(--surface-2)] text-[var(--brand-secondary)] border-[var(--border-default)]",
    accent: "bg-[var(--brand-soft)] text-[var(--brand-primary-strong)] border-[rgba(254,97,0,0.26)]"
  };

  const sizes = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded-full border uppercase tracking-wide",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge };
