"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  isLoading?: boolean;
  variant?: "default" | "primary" | "success" | "warning";
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  isLoading,
  variant = "default"
}: StatCardProps) {
  const variants = {
    default: "bg-[var(--surface)] border-[var(--border-default)]",
    primary: "bg-[linear-gradient(145deg,var(--surface-dark),var(--surface-dark-2))] border-[rgba(254,97,0,0.2)] text-[var(--text-inverse)]",
    success: "bg-[var(--status-success-soft)] border-[var(--status-success-border)]",
    warning: "bg-[var(--status-warning-soft)] border-[var(--status-warning-border)]"
  };

  const textColors = {
    default: "text-[var(--text-primary)]",
    primary: "text-[var(--text-inverse)]",
    success: "text-[var(--status-success)]",
    warning: "text-[var(--status-warning)]"
  };

  const subTextColors = {
    default: "text-[var(--text-tertiary)]",
    primary: "text-[rgba(255,247,241,0.7)]",
    success: "text-[var(--status-success)]",
    warning: "text-[var(--status-warning)]"
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface)] p-5">
        <Skeleton width={80} height={12} className="mb-3" />
        <Skeleton width="60%" height={28} />
      </div>
    );
  }

  return (
      <div className={cn(
        "border rounded-xl p-5 transition-all duration-200 hover:shadow-md",
        variants[variant]
      )}>
      <div className="flex items-start justify-between">
        <div>
          <p className={cn("text-xs font-bold uppercase tracking-wider", subTextColors[variant])}>
            {title}
          </p>
          <p className={cn("text-2xl font-extrabold mt-2 tracking-tight", textColors[variant])}>
            {value}
          </p>
          {subtitle && (
            <p className={cn("text-sm font-medium mt-1", subTextColors[variant])}>
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className={cn(
                "text-xs font-bold",
                trend.isPositive ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"
              )}>
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              <span className={cn("text-xs font-medium", subTextColors[variant])}>
                vs geçen ay
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn(
            "p-2.5 rounded-lg",
            variant === "primary" ? "bg-white/10" : "bg-[var(--surface-2)]"
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
