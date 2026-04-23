"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FilterCategoryOption,
  FilterSidebar,
  FilterState,
} from "@/components/product/FilterSidebar";

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryCounts?: Record<string, number>;
  categoryOptions?: FilterCategoryOption[];
  maxPrice?: number;
}

export function FilterDrawer({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  categoryCounts,
  categoryOptions,
  maxPrice = 5000,
}: FilterDrawerProps) {
  const activeFilterCount =
    filters.categories.length +
    (filters.priceRange[0] > 0 || filters.priceRange[1] < maxPrice ? 1 : 0) +
    (filters.vegan ? 1 : 0) +
    (filters.sugarFree ? 1 : 0) +
    (filters.highProtein ? 1 : 0) +
    (filters.glutenFree ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.onSale ? 1 : 0) +
    (filters.isNew ? 1 : 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] lg:hidden">
      <div
        className="absolute inset-0 bg-[#0B0F14]/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[2rem] bg-[#F5F7FA] shadow-2xl sm:left-0 sm:right-auto sm:top-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-sm sm:rounded-none">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#111827] px-6 py-4">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-5 w-5 text-[#FF6A00]" />
            <h2 className="text-xl font-black text-white">Filtreler</h2>
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-[#FF6A00] px-2 py-0.5 text-xs font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Filtreleri kapat"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-5">
          <FilterSidebar
            filters={filters}
            onFilterChange={onFilterChange}
            categoryCounts={categoryCounts}
            categoryOptions={categoryOptions}
            maxPrice={maxPrice}
            className="border-0 p-0 shadow-none"
          />
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-[#E5E7EB] bg-white p-4">
          <Button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-full bg-[#FF6A00] text-white hover:bg-[#E85F00]"
          >
            Sonuclari Goster
          </Button>
        </div>
      </div>
    </div>
  );
}
