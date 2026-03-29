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
    const [focused, setFocused] = React.useState(false);

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
          <input
            type={type}
            ref={ref}
            className={cn(
              "w-full h-11 px-4 bg-white border rounded-xl text-gray-900 placeholder:text-gray-400",
              "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                : "border-gray-200 focus:border-primary focus:ring-primary/20",
              icon && "pl-10",
              onClear && props.value && "pr-10",
              className
            )}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            {...props}
          />
          {onClear && props.value && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

interface SearchInputProps extends Omit<InputProps, "icon"> {
  onSearch?: (value: string) => void;
}

export function SearchInput({ onSearch, onChange, ...props }: SearchInputProps) {
  const [value, setValue] = React.useState(props.value as string || "");
  const [debounceTimer, setDebounceTimer] = React.useState<NodeJS.Timeout | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      onSearch?.(newValue);
    }, 300);
    setDebounceTimer(timer);
  };

  return (
    <Input
      {...props}
      value={value}
      onChange={handleChange}
      icon={<Search className="w-4 h-4" />}
      placeholder={props.placeholder || "Ara..."}
      onClear={() => {
        setValue("");
        onSearch?.("");
      }}
    />
  );
}
