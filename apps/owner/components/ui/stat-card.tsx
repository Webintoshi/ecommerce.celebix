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
    default: "bg-white border-[#E2E8F0]",
    primary: "bg-[#2B2B2B] border-[#2B2B2B] text-white",
    success: "bg-emerald-50 border-emerald-200",
    warning: "bg-amber-50 border-amber-200"
  };

  const textColors = {
    default: "text-[#2B2B2B]",
    primary: "text-white",
    success: "text-emerald-800",
    warning: "text-amber-800"
  };

  const subTextColors = {
    default: "text-[#64748B]",
    primary: "text-white/70",
    success: "text-emerald-600",
    warning: "text-amber-600"
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
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
                trend.isPositive ? "text-emerald-500" : "text-red-500"
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
            variant === "primary" ? "bg-white/10" : "bg-[#F8FAFC]"
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
