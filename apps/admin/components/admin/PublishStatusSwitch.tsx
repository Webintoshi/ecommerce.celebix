"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type PublishStatusSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (checked: boolean) => void;
  labelVisible?: boolean;
  className?: string;
} & Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
  "checked" | "defaultChecked" | "onCheckedChange" | "disabled" | "className" | "children"
>;

export function PublishStatusSwitch({
  checked,
  disabled = false,
  loading = false,
  onChange,
  labelVisible = true,
  className,
  ...props
}: PublishStatusSwitchProps) {
  const effectiveDisabled = disabled || loading;
  const isInteractive = !effectiveDisabled;

  const statusLabel = loading ? "Yükleniyor" : checked ? "Açık" : disabled ? "Pasif" : "Kapalı";

  return (
    <div className={cn("inline-flex w-fit min-w-[44px] flex-col items-center gap-2", className)}>
      <SwitchPrimitives.Root
        checked={checked}
        disabled={effectiveDisabled}
        onCheckedChange={onChange}
        aria-busy={loading}
        className={cn(
          "group peer relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-[3px] transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6A00]/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
          loading
            ? "cursor-progress bg-[#FFD9C2] shadow-[0_6px_14px_rgba(255,106,0,0.14)]"
            : checked
              ? "bg-[#FF6A00] shadow-[0_6px_16px_rgba(255,106,0,0.18)] hover:bg-[#E85D04]"
              : disabled
                ? "cursor-not-allowed bg-[#E5E7EB] opacity-80"
                : "bg-[#E5E7EB] shadow-[inset_0_1px_2px_rgba(148,163,184,0.14)] hover:bg-[#DDE1E7]",
          isInteractive ? "cursor-pointer active:scale-[0.98]" : "",
        )}
        {...props}
      >
        <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_100%)]" />
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none relative z-[1] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.10)] transition-all duration-200 ease-in-out will-change-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
            loading ? "scale-[0.96]" : "",
          )}
        >
          {loading ? <Loader2 className="h-[10px] w-[10px] animate-spin text-[#FF6A00]" /> : null}
        </SwitchPrimitives.Thumb>
      </SwitchPrimitives.Root>

      {labelVisible ? (
        <span
          className={cn(
            "text-center text-[12px] font-medium leading-none",
            loading
              ? "text-[#E85D04]"
              : checked
                ? "text-[#FF6A00]"
                : disabled
                  ? "text-[#9CA3AF]"
                  : "text-[#6B7280]",
          )}
        >
          {statusLabel}
        </span>
      ) : null}
    </div>
  );
}
