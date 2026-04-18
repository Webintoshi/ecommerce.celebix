"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { RangeSlider } from "@/components/ui/slider";
import { cn, formatPriceValue } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";

export interface ListingFilterOption {
  value: string;
  label: string;
  count: number;
  colorCode?: string | null;
}

export interface ListingFacetGroup {
  id: string;
  label: string;
  options: ListingFilterOption[];
}

export interface ListingFilterMetadata {
  categories: ListingFacetGroup | null;
  subcategories: ListingFacetGroup | null;
  attributes: ListingFacetGroup[];
  priceBounds: [number, number];
}

export interface ListingFilterState {
  categories: string[];
  subcategories: string[];
  attributes: Record<string, string[]>;
  priceRange: [number, number];
  inStock: boolean;
  onSale: boolean;
  isNew: boolean;
}

interface FilterSidebarProps {
  filters: ListingFilterState;
  metadata: ListingFilterMetadata;
  onFilterChange: (filters: Partial<ListingFilterState>) => void;
  minimalCopy?: boolean;
  className?: string;
}

interface ActiveFiltersProps {
  filters: ListingFilterState;
  metadata: ListingFilterMetadata;
  onFilterChange: (filters: Partial<ListingFilterState>) => void;
  minimalCopy?: boolean;
}

type ActiveFilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function FilterSection({ title, defaultOpen = true, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <section className="border-b border-[rgba(32,20,16,0.08)] pb-5">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 py-1 text-left"
      >
        <span className="text-[11px] uppercase tracking-[0.24em] text-[#222222]">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[#222222] transition-transform duration-300",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? <div className="space-y-3 pt-4">{children}</div> : null}
    </section>
  );
}

function FilterOptionRow({
  checked,
  label,
  count,
  colorCode,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  count: number;
  colorCode?: string | null;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-[#222222]">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
        className="h-4 w-4 rounded-none border-[#cdbfb2] data-[state=checked]:border-[#222222] data-[state=checked]:bg-[#222222]"
      />
      {colorCode ? (
        <span
          className="h-3.5 w-3.5 rounded-full border border-[rgba(32,20,16,0.12)]"
          style={{ backgroundColor: colorCode }}
        />
      ) : null}
      <span className="flex-1 truncate">{label}</span>
      {count > 0 ? (
        <span className="text-xs tracking-[0.08em] text-[#222222]">{count}</span>
      ) : null}
    </label>
  );
}

function buildOptionLabelLookup(group: ListingFacetGroup | null) {
  return new Map(group?.options.map((option) => [option.value, option.label]) ?? []);
}

export function createListingFilterState(priceBounds: [number, number]): ListingFilterState {
  return {
    categories: [],
    subcategories: [],
    attributes: {},
    priceRange: priceBounds,
    inStock: false,
    onSale: false,
    isNew: false,
  };
}

export function getActiveFilterCount(filters: ListingFilterState, metadata: ListingFilterMetadata) {
  let count = filters.categories.length + filters.subcategories.length;

  Object.values(filters.attributes).forEach((values) => {
    count += values.length;
  });

  if (
    filters.priceRange[0] !== metadata.priceBounds[0] ||
    filters.priceRange[1] !== metadata.priceBounds[1]
  ) {
    count += 1;
  }

  if (filters.inStock) count += 1;
  if (filters.onSale) count += 1;
  if (filters.isNew) count += 1;

  return count;
}

export function hasActiveListingFilters(
  filters: ListingFilterState,
  metadata: ListingFilterMetadata,
) {
  return getActiveFilterCount(filters, metadata) > 0;
}

export function ActiveFilters({
  filters,
  metadata,
  onFilterChange,
  minimalCopy = false,
}: ActiveFiltersProps) {
  const categoryLabels = buildOptionLabelLookup(metadata.categories);
  const subcategoryLabels = buildOptionLabelLookup(metadata.subcategories);

  const chips: ActiveFilterChip[] = [];

  filters.categories.forEach((value) => {
    chips.push({
      key: `category-${value}`,
      label: categoryLabels.get(value) ?? value,
      onRemove: () =>
        onFilterChange({
          categories: filters.categories.filter((item) => item !== value),
        }),
    });
  });

  filters.subcategories.forEach((value) => {
    chips.push({
      key: `subcategory-${value}`,
      label: subcategoryLabels.get(value) ?? value,
      onRemove: () =>
        onFilterChange({
          subcategories: filters.subcategories.filter((item) => item !== value),
        }),
    });
  });

  metadata.attributes.forEach((group) => {
    const values = filters.attributes[group.id] ?? [];
    const optionLabels = new Map(group.options.map((option) => [option.value, option.label]));

    values.forEach((value) => {
      chips.push({
        key: `${group.id}-${value}`,
        label: optionLabels.get(value) ?? value,
        onRemove: () =>
          onFilterChange({
            attributes: {
              ...filters.attributes,
              [group.id]: values.filter((item) => item !== value),
            },
          }),
      });
    });
  });

  if (
    filters.priceRange[0] !== metadata.priceBounds[0] ||
    filters.priceRange[1] !== metadata.priceBounds[1]
  ) {
    chips.push({
      key: "price",
      label: `${formatPriceValue(filters.priceRange[0])} - ${formatPriceValue(filters.priceRange[1])}`,
      onRemove: () => onFilterChange({ priceRange: metadata.priceBounds }),
    });
  }

  if (filters.inStock) {
    chips.push({
      key: "in-stock",
      label: "Stokta",
      onRemove: () => onFilterChange({ inStock: false }),
    });
  }

  if (filters.onSale) {
    chips.push({
      key: "on-sale",
      label: "Indirimli",
      onRemove: () => onFilterChange({ onSale: false }),
    });
  }

  if (filters.isNew) {
    chips.push({
      key: "is-new",
      label: "Yeni sezon",
      onRemove: () => onFilterChange({ isNew: false }),
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!minimalCopy ? (
          <span className="text-[11px] uppercase tracking-[0.24em] text-[#222222]">
            Aktif filtreler
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onFilterChange(createListingFilterState(metadata.priceBounds))}
          className="text-xs uppercase tracking-[0.18em] text-[#222222] underline underline-offset-4"
        >
          Sifirla
        </button>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.onRemove}
            className="inline-flex items-center gap-1.5 py-1 text-[12px] uppercase tracking-[0.14em] text-[#222222] underline decoration-[rgba(34,34,34,0.22)] underline-offset-[0.4rem] transition-colors hover:text-[#222222]"
          >
            <span>{chip.label}</span>
            <X className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilterSidebar({
  filters,
  metadata,
  onFilterChange,
  minimalCopy = false,
  className,
}: FilterSidebarProps) {
  const hasActiveFilters = hasActiveListingFilters(filters, metadata);

  const handleMultiSelect = (
    key: "categories" | "subcategories",
    option: string,
    checked: boolean,
  ) => {
    const currentValues = filters[key];
    const nextValues = checked
      ? [...currentValues, option]
      : currentValues.filter((value) => value !== option);

    onFilterChange({ [key]: nextValues });
  };

  const handleAttributeChange = (groupId: string, option: string, checked: boolean) => {
    const currentValues = filters.attributes[groupId] ?? [];
    const nextValues = checked
      ? [...currentValues, option]
      : currentValues.filter((value) => value !== option);

    onFilterChange({
      attributes: {
        ...filters.attributes,
        [groupId]: nextValues,
      },
    });
  };

  return (
    <aside
      className={cn(
        "bg-transparent p-0",
        className,
      )}
    >
      {hasActiveFilters ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => onFilterChange(createListingFilterState(metadata.priceBounds))}
            className="text-xs uppercase tracking-[0.18em] text-[#222222] underline underline-offset-4"
          >
            Temizle
          </button>
        </div>
      ) : null}

      <div className="space-y-5">
        {metadata.categories && metadata.categories.options.length > 1 ? (
          <FilterSection title={metadata.categories.label}>
            {metadata.categories.options.map((option) => (
              <FilterOptionRow
                key={option.value}
                checked={filters.categories.includes(option.value)}
                label={option.label}
                count={option.count}
                onCheckedChange={(checked) =>
                  handleMultiSelect("categories", option.value, checked)
                }
              />
            ))}
          </FilterSection>
        ) : null}

        {metadata.subcategories && metadata.subcategories.options.length > 1 ? (
          <FilterSection title={metadata.subcategories.label}>
            {metadata.subcategories.options.map((option) => (
              <FilterOptionRow
                key={option.value}
                checked={filters.subcategories.includes(option.value)}
                label={option.label}
                count={option.count}
                onCheckedChange={(checked) =>
                  handleMultiSelect("subcategories", option.value, checked)
                }
              />
            ))}
          </FilterSection>
        ) : null}

        {metadata.attributes.map((group, index) => (
          <FilterSection key={group.id} title={group.label} defaultOpen={index < 2}>
            {group.options.map((option) => (
              <FilterOptionRow
                key={option.value}
                checked={(filters.attributes[group.id] ?? []).includes(option.value)}
                label={option.label}
                count={option.count}
                colorCode={option.colorCode}
                onCheckedChange={(checked) =>
                  handleAttributeChange(group.id, option.value, checked)
                }
              />
            ))}
          </FilterSection>
        ))}

        {metadata.priceBounds[0] < metadata.priceBounds[1] ? (
          <FilterSection title="Fiyat araligi">
            <RangeSlider
              min={metadata.priceBounds[0]}
              max={metadata.priceBounds[1]}
              step={50}
              value={filters.priceRange}
              onChange={(value) => onFilterChange({ priceRange: value })}
            />
          </FilterSection>
        ) : null}

        <FilterSection title="Durum" defaultOpen={false}>
          <FilterOptionRow
            checked={filters.inStock}
            label="Stokta"
            count={0}
            onCheckedChange={(checked) => onFilterChange({ inStock: checked })}
          />
          <FilterOptionRow
            checked={filters.onSale}
            label="Indirimli"
            count={0}
            onCheckedChange={(checked) => onFilterChange({ onSale: checked })}
          />
          <FilterOptionRow
            checked={filters.isNew}
            label="Yeni sezon"
            count={0}
            onCheckedChange={(checked) => onFilterChange({ isNew: checked })}
          />
        </FilterSection>
      </div>
    </aside>
  );
}
