"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  FilterSidebar,
  type ListingFilterMetadata,
  type ListingFilterState,
  getActiveFilterCount,
} from "./FilterSidebar";
import { X } from "lucide-react";

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: ListingFilterState;
  metadata: ListingFilterMetadata;
  onFilterChange: (filters: Partial<ListingFilterState>) => void;
  minimalCopy?: boolean;
}

export function FilterDrawer({
  isOpen,
  onClose,
  filters,
  metadata,
  onFilterChange,
  minimalCopy = false,
}: FilterDrawerProps) {
  const activeFilterCount = getActiveFilterCount(filters, metadata);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        side="left"
        className="w-full max-w-[26rem] border-none bg-[#fbf8f4] p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="sticky top-0 z-10 mb-0 border-b border-[rgba(32,20,16,0.08)] bg-[#fbf8f4] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <SheetTitle className="mt-2 font-serif text-[1.55rem] tracking-[-0.04em] text-[#222222]">
                  {minimalCopy ? "Filtreler" : "Mobil secim"}
                </SheetTitle>
              </div>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 ? (
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[#222222]">
                    {activeFilterCount} secim
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 w-10 items-center justify-center text-[#222222]"
                  aria-label="Filtreleri kapat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <FilterSidebar
              filters={filters}
              metadata={metadata}
              onFilterChange={onFilterChange}
              minimalCopy={minimalCopy}
              className="border-none bg-transparent p-0 shadow-none"
            />
          </div>

          <div className="border-t border-[rgba(32,20,16,0.08)] bg-[#fbf8f4] p-5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center py-2 text-[12px] uppercase tracking-[0.22em] text-[#222222] underline underline-offset-[0.45rem]"
            >
              Sonuclari goster
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
