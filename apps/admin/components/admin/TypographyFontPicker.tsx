"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildTypographyFontCssStack,
  type StoreTypographyFontOption,
} from "@celebix/platform-config/src/typography";

type TypographyFontPickerProps = {
  label: string;
  value: StoreTypographyFontOption;
  onChange: (font: StoreTypographyFontOption) => void;
  catalog: StoreTypographyFontOption[];
  helperText?: string;
};

const DEFAULT_RESULT_LIMIT = 12;

export function TypographyFontPicker({
  label,
  value,
  onChange,
  catalog,
  helperText,
}: TypographyFontPickerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const inputId = useId();

  const filteredFonts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("tr");
    const selectedKey = value.family.toLocaleLowerCase("tr");

    const source =
      normalizedQuery.length < 2
        ? catalog
        : catalog.filter((font) => {
            const family = font.family.toLocaleLowerCase("tr");
            const category = font.category.toLocaleLowerCase("tr");
            return family.includes(normalizedQuery) || category.includes(normalizedQuery);
          });

    const selectedFont = catalog.find((font) => font.family.toLocaleLowerCase("tr") === selectedKey);
    const remainingFonts = source.filter((font) => font.family.toLocaleLowerCase("tr") !== selectedKey);

    return (selectedFont ? [selectedFont, ...remainingFonts] : remainingFonts).slice(0, DEFAULT_RESULT_LIMIT);
  }, [catalog, deferredQuery, value.family]);

  return (
    <div className="space-y-3 rounded-[8px] border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-900">
            {label}
          </label>
          {helperText ? <p className="mt-1 text-xs leading-5 text-gray-500">{helperText}</p> : null}
        </div>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
          {value.category}
        </div>
      </div>

      <div
        className="rounded-[8px] border border-gray-200 bg-[#FBFAF8] px-4 py-3"
        style={{ fontFamily: buildTypographyFontCssStack(value) }}
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Secili Font</p>
        <p className="mt-2 text-lg text-gray-900">{value.family}</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Google font ara..."
          className="w-full rounded-[8px] border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        />
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto rounded-[8px] border border-gray-100 bg-gray-50/60 p-2">
        {filteredFonts.map((font) => {
          const isActive = font.family === value.family;

          return (
            <button
              key={`${font.family}-${font.category}`}
              type="button"
              onClick={() => onChange(font)}
              className={cn(
                "flex w-full items-center justify-between rounded-[8px] border px-3 py-2.5 text-left transition-all",
                isActive
                  ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                  : "border-transparent bg-white text-gray-900 hover:border-gray-200 hover:bg-white",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{font.family}</p>
                <p className={cn("mt-0.5 text-xs", isActive ? "text-white/70" : "text-gray-500")}>
                  {font.category} / {font.availableWeights.join(", ")}
                </p>
              </div>
              {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}

        {filteredFonts.length === 0 ? (
          <div className="rounded-[8px] bg-white px-3 py-4 text-sm text-gray-500">Aramaniza uygun font bulunamadi.</div>
        ) : null}
      </div>
    </div>
  );
}
