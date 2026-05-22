"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  onClear?: () => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, onClear, type, ...props }, ref) => {
    return (
      <div className="w-full">
        {label ? (
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--admin-text-secondary)] md:text-sm md:normal-case md:tracking-normal">
            {label}
          </label>
        ) : null}
        <div className="relative">
          {icon ? (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-text-muted)]">
              {icon}
            </div>
          ) : null}
          <input
            type={type}
            ref={ref}
            className={cn(
              "h-12 w-full rounded-[1.45rem] border border-[var(--admin-border)] bg-white px-[1.125rem] text-base leading-6 text-[var(--admin-text)] placeholder:text-[var(--admin-text-muted)] shadow-[0_6px_18px_rgba(17,24,39,0.03)] md:h-11 md:px-4 md:text-sm md:rounded-2xl",
              "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-[var(--admin-danger)] focus:border-[var(--admin-danger)] focus:ring-[color:rgba(239,68,68,0.14)]"
                : "focus:border-[var(--admin-accent)] focus:ring-[color:rgba(255,106,0,0.12)]",
              icon ? "pl-10" : "",
              onClear && props.value ? "pr-12" : "",
              className,
            )}
            {...props}
          />
          {onClear && props.value ? (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-1.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[var(--admin-text-muted)] transition-colors hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-text)]"
              aria-label="Temizle"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-1 text-xs text-[var(--admin-danger)] md:text-sm">{error}</p> : null}
      </div>
    );
  },
);

Input.displayName = "Input";

interface SearchInputProps extends Omit<InputProps, "icon"> {
  onSearch?: (value: string) => void;
}

export function SearchInput({ onSearch, ...props }: SearchInputProps) {
  const [value, setValue] = React.useState((props.value as string) || "");
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setValue((props.value as string) || "");
  }, [props.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onSearch?.(newValue);
    }, 300);
  };

  return (
    <Input
      {...props}
      value={value}
      onChange={handleChange}
      icon={<Search className="h-4 w-4" />}
      placeholder={props.placeholder || "Ara..."}
      onClear={() => {
        setValue("");
        onSearch?.("");
      }}
    />
  );
}
