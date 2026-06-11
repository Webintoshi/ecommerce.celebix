"use client";

import { useEffect, useId, useRef } from "react";
import { HeaderIconChevron } from "@/components/layout/HeaderIcons";
import { cn } from "@/lib/utils";

type GiftFinderDropdownOption = {
  value: string;
  label: string;
};

type GiftFinderDropdownProps = {
  label: string;
  value: string;
  options: GiftFinderDropdownOption[];
  onChange: (value: string) => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export function GiftFinderDropdown({
  label,
  value,
  options,
  onChange,
  isOpen,
  onOpen,
  onClose,
}: GiftFinderDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onClose]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 basis-[140px] sm:basis-[160px] lg:max-w-[200px]">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </span>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 border-0 border-b bg-transparent pb-2.5 text-left text-sm text-neutral-900 transition-colors",
          isOpen ? "border-[#8B6914] text-[#8B6914]" : "border-neutral-900 hover:border-[#8B6914] hover:text-[#8B6914]",
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        <HeaderIconChevron
          size={14}
          className={cn("shrink-0 transition-transform", isOpen && "rotate-180")}
        />
        <span className="truncate">{selected?.label}</span>
      </button>

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-64 w-full min-w-[220px] overflow-y-auto border border-[#E8DFD3] bg-white py-1 shadow-[0_18px_48px_rgba(18,16,13,0.1)]"
        >
          {options.map((option) => (
            <li key={option.value || "empty"} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  "block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FBF8F4]",
                  option.value === value ? "bg-[#FBF8F4] text-[#8B6914]" : "text-neutral-800",
                )}
                onClick={() => {
                  onChange(option.value);
                  onClose();
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
