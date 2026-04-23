"use client";

import * as React from "react";
import { FilterState } from "./FilterSidebar";
import { FilterSidebar } from "./FilterSidebar";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, X } from "lucide-react";

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryCounts?: Record<string, number>;
}

export function FilterDrawer({ 
  isOpen, 
  onClose, 
  filters, 
  onFilterChange, 
  categoryCounts 
}: FilterDrawerProps) {
  const activeFilterCount =
    filters.categories.length +
    (filters.priceRange[0] > 0 || filters.priceRange[1] < 5000 ? 1 : 0) +
    (filters.vegan ? 1 : 0) +
    (filters.sugarFree ? 1 : 0) +
    (filters.highProtein ? 1 : 0) +
    (filters.glutenFree ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.onSale ? 1 : 0) +
    (filters.isNew ? 1 : 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="absolute left-0 top-0 bottom-0 w-full max-w-sm bg-[#FAFAFA] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0F1626] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-[#8A6B37]" />
            <h2 className="font-serif text-xl text-white">Filtreler</h2>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-[#8A6B37] text-white text-xs">
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <FilterSidebar
            filters={filters}
            onFilterChange={onFilterChange}
            categoryCounts={categoryCounts}
            className="border-0 p-0"
          />
        </div>
        
        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-[#E5E2DE] p-4 flex gap-3">
          <Button
            onClick={onClose}
            className="flex-1 bg-[#8A6B37] hover:bg-[#0F1626] text-white uppercase tracking-wider"
          >
            Sonuçları Göster
          </Button>
        </div>
      </div>
    </div>
  );
}
