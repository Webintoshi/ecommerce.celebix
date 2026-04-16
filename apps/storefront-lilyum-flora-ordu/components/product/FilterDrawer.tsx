"use client";

import { SlidersHorizontal, X } from "lucide-react";
import {
  type FilterCategoryOption,
  type FilterState,
  FilterSidebar,
  countActiveFilters,
} from "./FilterSidebar";

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryOptions?: FilterCategoryOption[];
  priceBounds: [number, number];
  showCategories?: boolean;
}

export function FilterDrawer({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  categoryOptions,
  priceBounds,
  showCategories = true,
}: FilterDrawerProps) {
  const activeFilterCount = countActiveFilters(filters, priceBounds);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-[#2A1E1A]/38 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-y-0 left-0 w-full max-w-sm overflow-y-auto bg-[var(--store-surface)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--store-border)] bg-[var(--store-surface)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-accent)]">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <p className="section-eyebrow">Mobil Filtre</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--store-ink)]">Sonuçları Daralt</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-[var(--store-accent)] px-2.5 py-1 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--store-border)] bg-white text-[var(--store-ink)]"
              aria-label="Filtreleri kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-4 pb-28">
          <FilterSidebar
            filters={filters}
            onFilterChange={onFilterChange}
            categoryOptions={categoryOptions}
            priceBounds={priceBounds}
            showCategories={showCategories}
            className="border-0 shadow-none"
          />
        </div>

        <div className="safe-area-pb fixed inset-x-0 bottom-0 border-t border-[var(--store-border)] bg-[rgba(255,248,245,0.96)] p-4 backdrop-blur-xl lg:hidden">
          <button type="button" onClick={onClose} className="cta-primary w-full justify-center">
            Sonuçları Göster
          </button>
        </div>
      </div>
    </div>
  );
}
