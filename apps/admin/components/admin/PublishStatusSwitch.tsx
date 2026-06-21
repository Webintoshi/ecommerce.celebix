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
  "checked" | "defaultChecked" | "onCheckedChange" | "onChange" | "disabled" | "className" | "children"
>;

export function PublishStatusSwitch({
  checked,
  disabled = false,
  loading = false,
  onChange,
  labelVisible = true,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...props
}: PublishStatusSwitchProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const effectiveDisabled = disabled || loading;
  const isInteractive = !effectiveDisabled;

  const statusLabel = loading ? "Yükleniyor" : checked ? "Açık" : disabled ? "Pasif" : "Kapalı";
  const activeHover = isHovered && isInteractive;
  const trackColor = loading
    ? "#FFD9C2"
    : disabled
      ? "#E5E7EB"
      : checked
        ? activeHover
          ? "#E85D04"
          : "#FF6A00"
        : activeHover
          ? "#DDE1E7"
          : "#E5E7EB";
  const trackShadow = loading
    ? "0 4px 10px rgba(255, 106, 0, 0.12)"
    : checked
      ? activeHover
        ? "0 6px 14px rgba(255, 106, 0, 0.18)"
        : "0 3px 8px rgba(255, 106, 0, 0.12)"
      : activeHover
        ? "inset 0 1px 2px rgba(148, 163, 184, 0.16), 0 2px 6px rgba(15, 23, 42, 0.06)"
        : "inset 0 1px 2px rgba(148, 163, 184, 0.14)";
  const effectiveTrackShadow = isFocused
    ? `${trackShadow}, 0 0 0 4px rgba(255, 106, 0, 0.20)`
    : trackShadow;

  return (
    <div className={cn("inline-flex w-fit min-w-[44px] flex-col items-center gap-2", className)}>
      <SwitchPrimitives.Root
        checked={checked}
        disabled={effectiveDisabled}
        onCheckedChange={onChange}
        aria-busy={loading}
        onMouseEnter={(event) => {
          setIsHovered(true);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          setIsHovered(false);
          onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        style={{
          ...style,
          width: 44,
          minWidth: 44,
          maxWidth: 44,
          height: 24,
          minHeight: 24,
          maxHeight: 24,
          padding: 3,
          borderRadius: 999,
          backgroundColor: trackColor,
          boxShadow: effectiveTrackShadow,
          boxSizing: "border-box",
        }}
        className={cn(
          "group peer relative inline-flex shrink-0 items-center border border-transparent transition-all duration-200 ease-in-out focus-visible:outline-none",
          loading ? "cursor-progress" : "",
          disabled ? "cursor-not-allowed opacity-80" : "",
          isInteractive ? "cursor-pointer active:scale-[0.98]" : "",
        )}
        {...props}
      >
        <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_100%)]" />
        <SwitchPrimitives.Thumb
          style={{
            width: 18,
            minWidth: 18,
            maxWidth: 18,
            height: 18,
            minHeight: 18,
            maxHeight: 18,
            transform: checked ? "translateX(20px)" : "translateX(0)",
          }}
          className={cn(
            "pointer-events-none relative z-[1] flex items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.10)] transition-all duration-200 ease-in-out will-change-transform",
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
