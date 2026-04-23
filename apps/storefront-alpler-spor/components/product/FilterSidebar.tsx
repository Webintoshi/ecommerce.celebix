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
  { value: "spor-ayakkabi", label: "Spor Ayakkabi" },
  { value: "giyim", label: "Spor Giyim" },
  { value: "outdoor", label: "Outdoor" },
  { value: "fitness", label: "Fitness" },
  { value: "takim-sporlari", label: "Takim Sporlari" },
  { value: "aksesuar", label: "Aksesuar" },
];

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function FilterSection({ title, defaultOpen = true, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="border-b border-[#DDE6DF] pb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-2 text-sm font-medium text-[#173D32] tracking-wide uppercase hover:text-[#F26A21] transition-colors"
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

interface FilterCheckboxProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  count?: number;
}

function FilterCheckbox({ label, checked, onCheckedChange, count }: FilterCheckboxProps) {
  const id = React.useId();

  return (
    <div className="flex items-center gap-3 text-sm text-[#25352E] transition-colors hover:text-[#173D32]">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="border-[#B8C4BB] data-[state=checked]:border-[#173D32] data-[state=checked]:bg-[#173D32]"
      />
      <label htmlFor={id} className="flex-1 cursor-pointer">
        {label}
      </label>
      {typeof count === "number" ? (
        <span className="text-xs font-medium text-[#66746B]">{count}</span>
      ) : null}
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
    filters.priceRange[1] < 5000 ||
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
      priceRange: [0, 5000],
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
    <div className={cn("bg-white p-6 border border-[#DDE6DF]", className)}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[#173D32]">Filtreler</h2>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm font-medium text-[#F26A21] transition-colors hover:text-[#173D32]"
          >
            Temizle
          </button>
        )}
      </div>

      <div className="space-y-1">
        <FilterSection title="Kategoriler">
          {CATEGORIES.map((category) => (
            <FilterCheckbox
              key={category.value}
              label={category.label}
              checked={filters.categories.includes(category.value)}
              onCheckedChange={(checked) => handleCategoryChange(category.value, checked)}
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
          <FilterCheckbox
            label="Hafif"
            checked={filters.vegan}
            onCheckedChange={(checked) => onFilterChange({ vegan: checked })}
          />
          <FilterCheckbox
            label="Nefes Alir"
            checked={filters.sugarFree}
            onCheckedChange={(checked) => onFilterChange({ sugarFree: checked })}
          />
          <FilterCheckbox
            label="Performans"
            checked={filters.highProtein}
            onCheckedChange={(checked) => onFilterChange({ highProtein: checked })}
          />
          <FilterCheckbox
            label="Dayanikli"
            checked={filters.glutenFree}
            onCheckedChange={(checked) => onFilterChange({ glutenFree: checked })}
          />
        </FilterSection>

        <FilterSection title="Stok & İndirim" defaultOpen={false}>
          <FilterCheckbox
            label="Stokta olanlar"
            checked={filters.inStock}
            onCheckedChange={(checked) => onFilterChange({ inStock: checked })}
          />
          <FilterCheckbox
            label="İndirimli ürünler"
            checked={filters.onSale}
            onCheckedChange={(checked) => onFilterChange({ onSale: checked })}
          />
          <FilterCheckbox
            label="Yeni ürünler"
            checked={filters.isNew}
            onCheckedChange={(checked) => onFilterChange({ isNew: checked })}
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
  "spor-ayakkabi": "Spor Ayakkabi",
  "giyim": "Spor Giyim",
  "outdoor": "Outdoor",
  "fitness": "Fitness",
  "takim-sporlari": "Takim Sporlari",
  "aksesuar": "Aksesuar",
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
      label: "Hafif",
      onRemove: () => onFilterChange({ vegan: false }),
    });
  }

  if (filters.sugarFree) {
    activeFilters.push({
      label: "Nefes Alir",
      onRemove: () => onFilterChange({ sugarFree: false }),
    });
  }

  if (filters.highProtein) {
    activeFilters.push({
      label: "Performans",
      onRemove: () => onFilterChange({ highProtein: false }),
    });
  }

  if (filters.glutenFree) {
    activeFilters.push({
      label: "Dayanikli",
      onRemove: () => onFilterChange({ glutenFree: false }),
    });
  }

  if (filters.inStock) {
    activeFilters.push({
      label: "Stokta",
      onRemove: () => onFilterChange({ inStock: false }),
    });
  }

  if (filters.onSale) {
    activeFilters.push({
      label: "İndirimli",
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E7F2EC] text-[#173D32] text-sm border border-[#B8C4BB] hover:bg-[#DDEBE2] transition-colors"
        >
          {filter.label}
          <X className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
