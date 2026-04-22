import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "default";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function buttonVariants({
  variant = "default",
  size = "md",
  className = "",
}: {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

  const variants = {
    default:
      "bg-[var(--admin-accent)] text-white hover:bg-[var(--admin-accent-hover)] focus:ring-[color:rgba(255,106,0,0.18)] shadow-[0_12px_24px_rgba(255,106,0,0.18)] hover:shadow-[0_16px_30px_rgba(255,106,0,0.22)]",
    primary:
      "bg-[var(--admin-accent)] text-white hover:bg-[var(--admin-accent-hover)] focus:ring-[color:rgba(255,106,0,0.18)] shadow-[0_12px_24px_rgba(255,106,0,0.18)] hover:shadow-[0_16px_30px_rgba(255,106,0,0.22)]",
    secondary:
      "border border-[var(--admin-border)] bg-white text-[var(--admin-text)] shadow-[0_8px_18px_rgba(17,24,39,0.04)] hover:bg-[var(--admin-bg)] focus:ring-[color:rgba(255,106,0,0.1)]",
    outline:
      "border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)] hover:bg-[#ffe7d7] focus:ring-[color:rgba(255,106,0,0.14)]",
    ghost:
      "text-[var(--admin-text-secondary)] hover:bg-[var(--admin-bg)] hover:text-[var(--admin-heading)] focus:ring-[color:rgba(59,130,246,0.14)]",
    danger:
      "bg-[var(--admin-danger)] text-white hover:bg-[#dc2626] focus:ring-[color:rgba(239,68,68,0.18)] shadow-[0_12px_24px_rgba(239,68,68,0.16)]",
  };

  const sizes = {
    sm: "h-11 px-4 text-[0.92rem] rounded-[1.1rem] md:h-8 md:px-3 md:text-sm md:rounded-xl",
    md: "h-11 px-[1.1rem] text-base rounded-[1.2rem] md:h-10 md:px-4 md:text-sm md:rounded-xl",
    lg: "h-12 px-[1.25rem] text-[1.02rem] rounded-[1.45rem] md:h-12 md:px-6 md:text-base md:rounded-2xl",
  };

  return cn(baseStyles, variants[variant], sizes[size], className);
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

  const variants = {
    primary:
      "bg-[var(--admin-accent)] text-white hover:bg-[var(--admin-accent-hover)] focus:ring-[color:rgba(255,106,0,0.18)] shadow-[0_12px_24px_rgba(255,106,0,0.18)] hover:shadow-[0_16px_30px_rgba(255,106,0,0.22)]",
    secondary:
      "border border-[var(--admin-border)] bg-white text-[var(--admin-text)] shadow-[0_8px_18px_rgba(17,24,39,0.04)] hover:bg-[var(--admin-bg)] focus:ring-[color:rgba(255,106,0,0.1)]",
    outline:
      "border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)] hover:bg-[#ffe7d7] focus:ring-[color:rgba(255,106,0,0.14)]",
    ghost:
      "text-[var(--admin-text-secondary)] hover:bg-[var(--admin-bg)] hover:text-[var(--admin-heading)] focus:ring-[color:rgba(59,130,246,0.14)]",
    danger:
      "bg-[var(--admin-danger)] text-white hover:bg-[#dc2626] focus:ring-[color:rgba(239,68,68,0.18)] shadow-[0_12px_24px_rgba(239,68,68,0.16)]",
  };

  const sizes = {
    sm: "h-11 px-4 text-[0.92rem] rounded-[1.1rem] md:h-8 md:px-3 md:text-sm md:rounded-xl",
    md: "h-11 px-[1.1rem] text-base rounded-[1.2rem] md:h-10 md:px-4 md:text-sm md:rounded-xl",
    lg: "h-12 px-[1.25rem] text-[1.02rem] rounded-[1.45rem] md:h-12 md:px-6 md:text-base md:rounded-2xl",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
