"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { BadgePill } from "./BadgePill";

export interface FilterState {
  categories: string[];
  priceRange: [number, number];
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
  categoryOptions?: FilterCategoryOption[];
  priceBounds: [number, number];
  className?: string;
  showCategories?: boolean;
}

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function FilterSection({ title, defaultOpen = true, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="border-b border-[var(--store-border)] pb-4">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--store-ink)]"
      >
        {title}
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {isOpen ? <div className="space-y-3 pt-3">{children}</div> : null}
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
  count,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  count?: number;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[18px] border border-transparent px-1 py-1 text-sm text-[var(--store-ink-soft)] transition hover:border-[var(--store-border)] hover:bg-white">
      <span className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-[var(--store-border-strong)] text-[var(--store-accent)] focus:ring-[var(--store-accent)]"
        />
        <span>{label}</span>
      </span>
      {typeof count === "number" ? (
        <span className="text-xs text-[var(--store-muted)]">{count}</span>
      ) : null}
    </label>
  );
}

export function countActiveFilters(filters: FilterState, priceBounds: [number, number]) {
  return (
    filters.categories.length +
    (filters.priceRange[0] > priceBounds[0] || filters.priceRange[1] < priceBounds[1] ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.onSale ? 1 : 0) +
    (filters.isNew ? 1 : 0)
  );
}

export function createDefaultFilters(priceBounds: [number, number]): FilterState {
  return {
    categories: [],
    priceRange: priceBounds,
    inStock: false,
    onSale: false,
    isNew: false,
  };
}

export function ActiveFilters({
  filters,
  onFilterChange,
  categoryOptions = [],
  priceBounds,
}: {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  categoryOptions?: FilterCategoryOption[];
  priceBounds: [number, number];
}) {
  const activeFilters: Array<{ label: string; onRemove: () => void }> = [];

  filters.categories.forEach((category) => {
    const label = categoryOptions.find((item) => item.value === category)?.label || category;
    activeFilters.push({
      label,
      onRemove: () =>
        onFilterChange({
          categories: filters.categories.filter((item) => item !== category),
        }),
    });
  });

  if (filters.priceRange[0] > priceBounds[0] || filters.priceRange[1] < priceBounds[1]) {
    activeFilters.push({
      label: `${formatPrice(filters.priceRange[0])} - ${formatPrice(filters.priceRange[1])}`,
      onRemove: () => onFilterChange({ priceRange: priceBounds }),
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
      label: "Indirimli",
      onRemove: () => onFilterChange({ onSale: false }),
    });
  }

  if (filters.isNew) {
    activeFilters.push({
      label: "Yeni",
      onRemove: () => onFilterChange({ isNew: false }),
    });
  }

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {activeFilters.map((filter, index) => (
        <button
          key={`${filter.label}-${index}`}
          type="button"
          onClick={filter.onRemove}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--store-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
        >
          {filter.label}
          <X className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

export function FilterSidebar({
  filters,
  onFilterChange,
  categoryOptions = [],
  priceBounds,
  className,
  showCategories = true,
}: FilterSidebarProps) {
  const hasActiveFilters = countActiveFilters(filters, priceBounds) > 0;

  const clearFilters = () => {
    onFilterChange(createDefaultFilters(priceBounds));
  };

  return (
    <div className={cn("soft-panel p-5", className)}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="section-eyebrow">Filtreler</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--store-ink)]">Kesfi Daralt</h2>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-semibold text-[var(--store-accent)] transition hover:text-[var(--store-accent-strong)]"
          >
            Temizle
          </button>
        ) : null}
      </div>

      <div className="space-y-4">
        {showCategories && categoryOptions.length > 0 ? (
          <FilterSection title="Kategoriler">
            {categoryOptions.map((category) => (
              <FilterCheckbox
                key={category.value}
                label={category.label}
                count={category.count}
                checked={filters.categories.includes(category.value)}
                onChange={(checked) => {
                  const nextCategories = checked
                    ? [...filters.categories, category.value]
                    : filters.categories.filter((item) => item !== category.value);
                  onFilterChange({ categories: nextCategories });
                }}
              />
            ))}
          </FilterSection>
        ) : null}

        <FilterSection title="Fiyat Araligi">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
                Min
              </span>
              <input
                type="number"
                min={priceBounds[0]}
                max={filters.priceRange[1]}
                value={filters.priceRange[0]}
                onChange={(event) => {
                  const nextMin = Number(event.target.value || priceBounds[0]);
                  onFilterChange({
                    priceRange: [Math.max(priceBounds[0], nextMin), filters.priceRange[1]],
                  });
                }}
                className="h-11 w-full rounded-[18px] border border-[var(--store-border)] bg-white px-4 text-sm text-[var(--store-ink)] outline-none focus:border-[var(--store-accent)]"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
                Max
              </span>
              <input
                type="number"
                min={filters.priceRange[0]}
                max={priceBounds[1]}
                value={filters.priceRange[1]}
                onChange={(event) => {
                  const nextMax = Number(event.target.value || priceBounds[1]);
                  onFilterChange({
                    priceRange: [filters.priceRange[0], Math.min(priceBounds[1], nextMax)],
                  });
                }}
                className="h-11 w-full rounded-[18px] border border-[var(--store-border)] bg-white px-4 text-sm text-[var(--store-ink)] outline-none focus:border-[var(--store-accent)]"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { label: "Tum Fiyatlar", range: priceBounds },
              { label: "0 - 1000", range: [priceBounds[0], Math.min(priceBounds[1], 1000)] as [number, number] },
              { label: "1000 - 2500", range: [Math.min(priceBounds[1], 1000), Math.min(priceBounds[1], 2500)] as [number, number] },
              { label: "2500+", range: [Math.min(priceBounds[1], 2500), priceBounds[1]] as [number, number] },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => onFilterChange({ priceRange: option.range })}
              >
                <BadgePill
                  tone={
                    filters.priceRange[0] === option.range[0] && filters.priceRange[1] === option.range[1]
                      ? "solid"
                      : "outline"
                  }
                >
                  {option.label}
                </BadgePill>
              </button>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Durum">
          <FilterCheckbox
            label="Stokta olanlar"
            checked={filters.inStock}
            onChange={(checked) => onFilterChange({ inStock: checked })}
          />
          <FilterCheckbox
            label="Indirimli urunler"
            checked={filters.onSale}
            onChange={(checked) => onFilterChange({ onSale: checked })}
          />
          <FilterCheckbox
            label="Yeni eklenenler"
            checked={filters.isNew}
            onChange={(checked) => onFilterChange({ isNew: checked })}
          />
        </FilterSection>
      </div>
    </div>
  );
}
