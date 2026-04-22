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
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500 md:text-sm md:normal-case md:tracking-normal">
            {label}
          </label>
        ) : null}
        <div className="relative">
          {icon ? (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          ) : null}
          <input
            type={type}
            ref={ref}
            className={cn(
              "h-12 w-full rounded-[1.45rem] border bg-white px-[1.125rem] text-base leading-6 text-gray-900 placeholder:text-gray-400 md:h-11 md:px-4 md:text-sm md:rounded-2xl",
              "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                : "border-gray-200 focus:border-primary focus:ring-primary/20",
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
              className="absolute right-1.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#f7efe8] hover:text-gray-700"
              aria-label="Temizle"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-1 text-xs text-red-500 md:text-sm">{error}</p> : null}
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
