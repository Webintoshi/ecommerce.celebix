"use client";

import { ChevronDown, ArrowUpDown } from "lucide-react";

type SortOption = "date-desc" | "date-asc" | "total-desc" | "total-asc";

interface OrderSortProps {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "date-desc", label: "Tarih (Yeni-Eski)" },
  { value: "date-asc", label: "Tarih (Eski-Yeni)" },
  { value: "total-desc", label: "Tutar (Yüksek-Düşük)" },
  { value: "total-asc", label: "Tutar (Düşük-Yüksek)" },
];

export function OrderSort({ currentSort, onSortChange }: OrderSortProps) {
  return (
    <div className="relative">
      <select
        value={currentSort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="appearance-none pl-9 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white cursor-pointer text-sm"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}
