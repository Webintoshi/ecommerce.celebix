"use client";

import * as React from "react";
import { FilterState } from "./FilterSidebar";
import { FilterSidebar } from "./FilterSidebar";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface FilterDrawerProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryCounts?: Record<string, number>;
}

export function FilterDrawer({ filters, onFilterChange, categoryCounts }: FilterDrawerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const activeFilterCount =
    filters.categories.length +
    (filters.priceRange[0] > 0 || filters.priceRange[1] < 500 ? 1 : 0) +
    (filters.vegan ? 1 : 0) +
    (filters.sugarFree ? 1 : 0) +
    (filters.highProtein ? 1 : 0) +
    (filters.glutenFree ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.onSale ? 1 : 0) +
    (filters.isNew ? 1 : 0);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="lg:hidden gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            Filtrele
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary text-white text-xs rounded-full">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-full sm:w-[400px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Filtreler</SheetTitle>
          </SheetHeader>
          <FilterSidebar
            filters={filters}
            onFilterChange={onFilterChange}
            categoryCounts={categoryCounts}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
