"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";
    
    const variants = {
      primary:
        "border border-[var(--brand-primary)] bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-primary-strong))] text-[#FFF8F3] shadow-[0_14px_32px_rgba(254,97,0,0.18)] hover:border-[var(--brand-primary-strong)] hover:shadow-[0_18px_34px_rgba(254,97,0,0.22)] focus:ring-[var(--brand-soft)]",
      secondary:
        "border border-[var(--border-default)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus:ring-[var(--brand-soft)]",
      ghost:
        "border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--text-primary)] focus:ring-[var(--brand-soft)]",
      danger:
        "border border-[var(--status-danger-border)] bg-[var(--surface)] text-[var(--status-danger)] hover:bg-[var(--status-danger-soft)] focus:ring-[var(--status-danger-soft)]"
    };

    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-5 text-sm",
      lg: "h-12 px-6 text-base"
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Yükleniyor...</span>
          </>
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
