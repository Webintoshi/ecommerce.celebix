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
    "inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#FDBA8C] disabled:text-white active:scale-[0.98]";

  const variants = {
    default: "bg-[#FF6A00] text-white hover:bg-[#E85F00] active:bg-[#CC5400]",
    primary:
      "bg-[#FF6A00] text-white hover:bg-[#E85F00] active:bg-[#CC5400]",
    secondary:
      "bg-[#111827] text-white hover:bg-[#1F2937]",
    outline:
      "border border-[#D1D5DB] bg-transparent text-[#111827] hover:bg-[#F3F4F6]",
    ghost: "text-[#374151] hover:bg-[#F3F4F6]",
    danger: "bg-[#EF4444] text-white hover:bg-[#DC2626]",
  };

  const sizes = {
    sm: "h-8 px-3 text-sm rounded-lg",
    md: "h-10 px-4 text-sm rounded-lg",
    lg: "h-12 px-6 text-base rounded-xl",
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
    "inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#FDBA8C] disabled:text-white active:scale-[0.98]";

  const variants = {
    default:
      "bg-[#FF6A00] text-white hover:bg-[#E85F00] active:bg-[#CC5400]",
    primary:
      "bg-[#FF6A00] text-white hover:bg-[#E85F00] active:bg-[#CC5400]",
    secondary:
      "bg-[#111827] text-white hover:bg-[#1F2937]",
    outline:
      "border border-[#D1D5DB] bg-transparent text-[#111827] hover:bg-[#F3F4F6]",
    ghost: "text-[#374151] hover:bg-[#F3F4F6]",
    danger: "bg-[#EF4444] text-white hover:bg-[#DC2626]",
  };

  const sizes = {
    sm: "h-8 px-3 text-sm rounded-lg",
    md: "h-10 px-4 text-sm rounded-lg",
    lg: "h-12 px-6 text-base rounded-xl",
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
