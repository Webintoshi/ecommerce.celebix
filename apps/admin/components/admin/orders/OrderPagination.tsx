"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface OrderPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function OrderPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: OrderPaginationProps) {
  const startItem = currentPage * itemsPerPage + 1;
  const endItem = Math.min((currentPage + 1) * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 0; i < totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(0);

      if (currentPage <= 2) {
        // Near start
        for (let i = 1; i <= 3; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages - 1);
      } else if (currentPage >= totalPages - 3) {
        // Near end
        pages.push("...");
        for (let i = totalPages - 4; i < totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Middle
        pages.push("...");
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push("...");
        pages.push(totalPages - 1);
      }
    }

    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border-t border-gray-200">
      {/* Info */}
      <div className="text-sm text-gray-600">
        Toplam <span className="font-medium text-gray-900">{totalItems}</span> sipariş
        {totalItems > itemsPerPage && (
          <>
            {" "}/ gösteriliyor:{" "}
            <span className="font-medium text-gray-900">
              {startItem}-{endItem}
            </span>
          </>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-1">
        {/* Previous Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page Numbers */}
        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((page, index) => {
            if (typeof page === "string") {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                  ...
                </span>
              );
            }

            const isActive = page === currentPage;
            return (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`min-w-[2.5rem] px-2 py-1 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : "border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {page + 1}
              </button>
            );
          })}
        </div>

        {/* Mobile: Current Page */}
        <div className="sm:hidden text-sm text-gray-600">
          Sayfa <span className="font-medium">{currentPage + 1}</span> / {totalPages}
        </div>

        {/* Next Button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
