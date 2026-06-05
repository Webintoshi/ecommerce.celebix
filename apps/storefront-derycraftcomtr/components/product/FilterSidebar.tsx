"use client";

import * as React from "react";
import { cn, formatPriceValue } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { RangeSlider } from "@/components/ui/slider";
import { X, ChevronDown, ChevronUp } from "lucide-react";

export interface FilterState {
  categories: string[];
  priceRange: [number, number];
  vegan: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  glutenFree: boolean;
  inStock: boolean;
  onSale: boolean;
  isNew: boolean;
}

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryCounts?: Record<string, number>;
  className?: string;
}

const CATEGORIES = [
  { value: "kol-saati-kordonu", label: "Kol Saati Kordonu" },
  { value: "akilli-saat-kordonu", label: "Smart Watch Bands" },
  { value: "deri-bileklik", label: "Deri Bileklik" },
  { value: "anahtarlik", label: "Keychains" },
  { value: "kartlik", label: "Cardholders" },
  { value: "cuzdan", label: "Wallets" },
  { value: "kemer", label: "Kemer" },
  { value: "canta", label: "Bags" },
];

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function FilterSection({ title, defaultOpen = true, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="border-b border-[#E5E2DE] pb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-2 text-sm font-medium text-[#0F1626] tracking-wide uppercase hover:text-[#8A6B37] transition-colors"
      >
        {title}
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
      {isOpen && <div className="pt-3 space-y-3">{children}</div>}
    </div>
  );
}

export function FilterSidebar({ filters, onFilterChange, categoryCounts, className }: FilterSidebarProps) {
  const handleCategoryChange = (category: string, checked: boolean) => {
    const newCategories = checked
      ? [...filters.categories, category]
      : filters.categories.filter((c) => c !== category);
    onFilterChange({ categories: newCategories });
  };

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.priceRange[0] > 0 ||
    filters.priceRange[1] < 500 ||
    filters.vegan ||
    filters.sugarFree ||
    filters.highProtein ||
    filters.glutenFree ||
    filters.inStock ||
    filters.onSale ||
    filters.isNew;

  const clearFilters = () => {
    onFilterChange({
      categories: [],
      priceRange: [0, 500],
      vegan: false,
      sugarFree: false,
      highProtein: false,
      glutenFree: false,
      inStock: false,
      onSale: false,
      isNew: false,
    });
  };

  return (
    <div className={cn("bg-white p-6 border border-[#E5E2DE]", className)}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-serif text-xl text-[#0F1626]">Filtreler</h2>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-[#8A6B37] hover:text-[#0F1626] transition-colors"
          >
            Temizle
          </button>
        )}
      </div>

      <div className="space-y-1">
        <FilterSection title="Kategoriler">
          {CATEGORIES.map((category) => (
            <Checkbox
              key={category.value}
              label={category.label}
              checked={filters.categories.includes(category.value)}
              onChange={(e) => handleCategoryChange(category.value, e.target.checked)}
              count={categoryCounts?.[category.value]}
            />
          ))}
        </FilterSection>

        <FilterSection title="Fiyat Aralığı">
          <RangeSlider
            min={0}
            max={5000}
            step={50}
            value={filters.priceRange}
            onChange={(value) => onFilterChange({ priceRange: value })}
          />
        </FilterSection>

        <FilterSection title="Özellikler">
          <Checkbox
            label="El Yapımı"
            checked={filters.vegan}
            onChange={(e) => onFilterChange({ vegan: e.target.checked })}
          />
          <Checkbox
            label="Vegan Deri"
            checked={filters.sugarFree}
            onChange={(e) => onFilterChange({ sugarFree: e.target.checked })}
          />
          <Checkbox
            label="Premium Koleksiyon"
            checked={filters.highProtein}
            onChange={(e) => onFilterChange({ highProtein: e.target.checked })}
          />
          <Checkbox
            label="Personalizable"
            checked={filters.glutenFree}
            onChange={(e) => onFilterChange({ glutenFree: e.target.checked })}
          />
        </FilterSection>

        <FilterSection title="Stock & Discount" defaultOpen={false}>
          <Checkbox
            label="In stock"
            checked={filters.inStock}
            onChange={(e) => onFilterChange({ inStock: e.target.checked })}
          />
          <Checkbox
            label="Discounted products"
            checked={filters.onSale}
            onChange={(e) => onFilterChange({ onSale: e.target.checked })}
          />
          <Checkbox
            label="New products"
            checked={filters.isNew}
            onChange={(e) => onFilterChange({ isNew: e.target.checked })}
          />
        </FilterSection>
      </div>
    </div>
  );
}

interface ActiveFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  "kol-saati-kordonu": "Kol Saati Kordonu",
  "akilli-saat-kordonu": "Smart Watch Bands",
  "deri-bileklik": "Deri Bileklik",
  "anahtarlik": "Keychains",
  "kartlik": "Cardholders",
  "cuzdan": "Wallets",
  "kemer": "Kemer",
  "canta": "Bags",
};

export function ActiveFilters({ filters, onFilterChange }: ActiveFiltersProps) {
  const activeFilters: { label: string; onRemove: () => void }[] = [];

  filters.categories.forEach((cat) => {
    activeFilters.push({
      label: CATEGORY_LABELS[cat] || cat,
      onRemove: () =>
        onFilterChange({
          categories: filters.categories.filter((c) => c !== cat),
        }),
    });
  });

  if (filters.priceRange[0] > 0 || filters.priceRange[1] < 5000) {
    activeFilters.push({
      label: `${formatPriceValue(filters.priceRange[0])}₺ - ${formatPriceValue(filters.priceRange[1])}₺`,
      onRemove: () => onFilterChange({ priceRange: [0, 5000] }),
    });
  }

  if (filters.vegan) {
    activeFilters.push({
      label: "Handmade",
      onRemove: () => onFilterChange({ vegan: false }),
    });
  }

  if (filters.sugarFree) {
    activeFilters.push({
      label: "Vegan Deri",
      onRemove: () => onFilterChange({ sugarFree: false }),
    });
  }

  if (filters.highProtein) {
    activeFilters.push({
      label: "Premium Koleksiyon",
      onRemove: () => onFilterChange({ highProtein: false }),
    });
  }

  if (filters.glutenFree) {
    activeFilters.push({
      label: "Personalizable",
      onRemove: () => onFilterChange({ glutenFree: false }),
    });
  }

  if (filters.inStock) {
    activeFilters.push({
      label: "In Stock",
      onRemove: () => onFilterChange({ inStock: false }),
    });
  }

  if (filters.onSale) {
    activeFilters.push({
      label: "Discounted",
      onRemove: () => onFilterChange({ onSale: false }),
    });
  }

  if (filters.isNew) {
    activeFilters.push({
      label: "Yeni",
      onRemove: () => onFilterChange({ isNew: false }),
    });
  }

  if (activeFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {activeFilters.map((filter, index) => (
        <button
          key={index}
          onClick={filter.onRemove}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#8A6B37]/10 text-[#0F1626] text-sm border border-[#8A6B37]/20 hover:bg-[#8A6B37]/20 transition-colors"
        >
          {filter.label}
          <X className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
