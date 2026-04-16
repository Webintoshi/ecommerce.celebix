"use client";

import { SlidersHorizontal } from "lucide-react";

export interface SortOption {
  value: string;
  label: string;
}

interface ProductGridToolbarProps {
  title: string;
  description?: string;
  totalCount: number;
  visibleCount: number;
  sortOptions: SortOption[];
  sortValue: string;
  onSortChange: (value: string) => void;
  activeFilterCount?: number;
  onOpenFilters?: () => void;
  filterLabel?: string;
}

export function ProductGridToolbar({
  title,
  description,
  totalCount,
  visibleCount,
  sortOptions,
  sortValue,
  onSortChange,
  activeFilterCount = 0,
  onOpenFilters,
  filterLabel = "Filtreler",
}: ProductGridToolbarProps) {
  return (
    <div className="soft-panel flex flex-col gap-4 rounded-[28px] px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow">Keşif</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--store-ink)]">{title}</h2>
          <p className="mt-2 text-sm text-[var(--store-muted)]">
            {description || `${visibleCount} / ${totalCount} ürün gösteriliyor.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onOpenFilters ? (
            <button type="button" onClick={onOpenFilters} className="cta-secondary lg:hidden">
              <SlidersHorizontal className="h-4 w-4" />
              <span>
                {filterLabel}
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </span>
            </button>
          ) : null}
          <label className="flex min-w-[190px] items-center gap-3 rounded-full border border-[var(--store-border)] bg-white px-4 py-3 text-sm text-[var(--store-muted)]">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--store-ink)]">
              Sırala
            </span>
            <select
              value={sortValue}
              onChange={(event) => onSortChange(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-[var(--store-ink)] outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
