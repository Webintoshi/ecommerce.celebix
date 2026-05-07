"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RangeSlider } from "@/components/ui/slider";
import { cn, formatPriceValue } from "@/lib/utils";

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

export interface FilterCategoryOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryCounts?: Record<string, number>;
  categoryOptions?: FilterCategoryOption[];
  maxPrice?: number;
  className?: string;
}

interface ActiveFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryOptions?: FilterCategoryOption[];
  maxPrice?: number;
}

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function formatCategoryLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function FilterSection({ title, defaultOpen = true, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="border-b border-[#E5E7EB] pb-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-2 text-sm font-bold uppercase tracking-[0.14em] text-[#111827] transition-colors hover:text-[#FF6A00]"
      >
        {title}
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {isOpen ? <div className="space-y-3 pt-3">{children}</div> : null}
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
    <div className="flex items-center gap-3 text-sm text-[#374151] transition-colors hover:text-[#111827]">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="border-[#D1D5DB] data-[state=checked]:border-[#FF6A00] data-[state=checked]:bg-[#FF6A00]"
      />
      <label htmlFor={id} className="flex-1 cursor-pointer">
        {label}
      </label>
      {typeof count === "number" ? (
        <span className="text-xs font-medium text-[#6B7280]">{count}</span>
      ) : null}
    </div>
  );
}

function resolveCategoryOptions(
  categoryCounts: Record<string, number>,
  categoryOptions?: FilterCategoryOption[],
) {
  if (categoryOptions) return categoryOptions;

  return Object.entries(categoryCounts)
    .filter(([value]) => Boolean(value))
    .map(([value, count]) => ({
      value,
      label: formatCategoryLabel(value),
      count,
    }));
}

export function FilterSidebar({
  filters,
  onFilterChange,
  categoryCounts = {},
  categoryOptions,
  maxPrice = 5000,
  className,
}: FilterSidebarProps) {
  const resolvedCategoryOptions = resolveCategoryOptions(categoryCounts, categoryOptions);

  const handleCategoryChange = (category: string, checked: boolean) => {
    const nextCategories = checked
      ? [...filters.categories, category]
      : filters.categories.filter((current) => current !== category);
    onFilterChange({ categories: nextCategories });
  };

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.priceRange[0] > 0 ||
    filters.priceRange[1] < maxPrice ||
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
      priceRange: [0, maxPrice],
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
    <div className={cn("rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm", className)}>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-black text-[#111827]">Filtreler</h2>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-bold text-[#FF6A00] transition-colors hover:text-[#C2410C]"
          >
            Temizle
          </button>
        ) : null}
      </div>

      <div className="space-y-1">
        {resolvedCategoryOptions.length > 0 ? (
          <FilterSection title="Kategoriler">
            {resolvedCategoryOptions.map((category) => (
              <FilterCheckbox
                key={category.value}
                label={category.label}
                checked={filters.categories.includes(category.value)}
                onCheckedChange={(checked) => handleCategoryChange(category.value, checked)}
                count={category.count ?? categoryCounts[category.value]}
              />
            ))}
          </FilterSection>
        ) : null}

        <FilterSection title="Fiyat Araligi">
          <RangeSlider
            min={0}
            max={maxPrice}
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

export function ActiveFilters({
  filters,
  onFilterChange,
  categoryOptions = [],
  maxPrice = 5000,
}: ActiveFiltersProps) {
  const categoryLabelMap = new Map(categoryOptions.map((category) => [category.value, category.label]));
  const activeFilters: { label: string; onRemove: () => void }[] = [];

  filters.categories.forEach((category) => {
    activeFilters.push({
      label: categoryLabelMap.get(category) || formatCategoryLabel(category),
      onRemove: () =>
        onFilterChange({
          categories: filters.categories.filter((current) => current !== category),
        }),
    });
  });

  if (filters.priceRange[0] > 0 || filters.priceRange[1] < maxPrice) {
    activeFilters.push({
      label: `${formatPriceValue(filters.priceRange[0])} TL - ${formatPriceValue(filters.priceRange[1])} TL`,
      onRemove: () => onFilterChange({ priceRange: [0, maxPrice] }),
    });
  }

  [
    [filters.vegan, "Hafif", { vegan: false }],
    [filters.sugarFree, "Nefes Alir", { sugarFree: false }],
    [filters.highProtein, "Performans", { highProtein: false }],
    [filters.glutenFree, "Dayanikli", { glutenFree: false }],
    [filters.inStock, "Stokta", { inStock: false }],
    [filters.onSale, "İndirimli", { onSale: false }],
    [filters.isNew, "Yeni", { isNew: false }],
  ].forEach(([enabled, label, reset]) => {
    if (!enabled) return;
    activeFilters.push({
      label: label as string,
      onRemove: () => onFilterChange(reset as Partial<FilterState>),
    });
  });

  if (activeFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {activeFilters.map((filter) => (
        <button
          key={filter.label}
          type="button"
          onClick={filter.onRemove}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6A00] bg-[#FFF1E8] px-3 py-1.5 text-sm font-semibold text-[#C2410C] transition-colors hover:bg-[#FFE2CF]"
        >
          {filter.label}
          <X className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
