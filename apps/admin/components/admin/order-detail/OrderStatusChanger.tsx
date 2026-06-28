"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ORDER_STATUS_CONFIG } from "@/types/order";
import type { OrderStatus } from "@/types/order";
import { ChevronDown, Check } from "lucide-react";

interface OrderStatusChangerProps {
  currentStatus: OrderStatus;
  onStatusChange: (newStatus: OrderStatus) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

const STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

export function OrderStatusChanger({
  currentStatus,
  onStatusChange,
  disabled = false,
  className = "",
}: OrderStatusChangerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentConfig = ORDER_STATUS_CONFIG[currentStatus];

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        right: window.innerWidth - rect.right - window.scrollX,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside button and menu
      if (
        buttonRef.current &&
        menuRef.current &&
        !buttonRef.current.contains(target) &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Update menu position on scroll
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const handleScroll = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        right: window.innerWidth - rect.right - window.scrollX,
      });
    };

    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (newStatus === currentStatus || isUpdating) return;

    if (newStatus === "cancelled" || newStatus === "refunded") {
      const confirmed = confirm(
        `Bu siparişi ${newStatus === "cancelled" ? "iptal" : "iade"} etmek istediğinizden emin misiniz?`
      );
      if (!confirmed) {
        setIsOpen(false);
        return;
      }
    }

    setIsUpdating(true);
    setIsOpen(false);

    try {
      await onStatusChange(newStatus);
    } catch (error) {
      console.error("Durum güncellenirken hata:", error);
      alert("Durum güncellenirken bir hata oluştu.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => !disabled && !isUpdating && setIsOpen(!isOpen)}
        disabled={disabled || isUpdating}
        className={`
          inline-flex min-h-11 items-center gap-2 rounded-[8px] border px-4 py-2.5 text-sm font-semibold
          transition-all duration-200
          ${disabled || isUpdating
            ? "cursor-not-allowed border-[#e7ddd4] bg-[#f4ede6] text-stone-400"
            : isOpen
              ? "border-[var(--admin-accent)] bg-gradient-to-r from-[#FF6A00] to-[#df650d] text-white shadow-[0_14px_30px_rgba(255,106,0,0.2)]"
              : "border-[#e1d2c3] bg-white text-[#6f5a49] shadow-sm hover:border-[var(--admin-accent)]/35 hover:bg-[var(--admin-accent-soft)]"
          }
        `}
      >
        <span className={`w-2 h-2 rounded-full ${
          isOpen ? "bg-white" : 
          currentStatus === "cancelled" ? "bg-red-500" :
          currentStatus === "refunded" ? "bg-orange-500" :
          currentStatus === "delivered" ? "bg-green-500" :
          "bg-[var(--admin-accent)]"
        }`} />
        <span>{currentConfig?.label || "Bilinmiyor"}</span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu - Using Portal for fixed positioning */}
      {isOpen && !disabled && typeof document !== "undefined" && (
        createPortal(
          <div 
            ref={menuRef}
            className="fixed z-[9999] w-72 overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-2xl backdrop-blur"
            style={{ 
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              boxShadow: "0 28px 70px rgba(122, 78, 43, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-[var(--admin-border)] bg-gradient-to-r from-[#fff7f1] to-white px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
                Sipariş Durumunu Değiştir
              </p>
            </div>

            {/* Options */}
            <div className="py-1 max-h-[350px] overflow-y-auto">
              {STATUS_OPTIONS.map((status) => {
                const config = ORDER_STATUS_CONFIG[status];
                const isSelected = status === currentStatus;
                const isNegative = status === "cancelled" || status === "refunded";

                return (
                  <button
                    key={status}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(status);
                    }}
                    disabled={isUpdating}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left
                      transition-colors
                      ${isSelected
                        ? "bg-[var(--admin-accent-soft)] text-[#b95a13]"
                        : isNegative
                          ? "text-red-600 hover:bg-rose-50"
                          : "text-stone-700 hover:bg-[#FCFDFE]"
                      }
                      ${isUpdating ? "opacity-50" : ""}
                    `}
                  >
                    {/* Icon/Indicator */}
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                      ${isSelected
                        ? "bg-[#ffd8b4] text-[#b95a13]"
                        : isNegative
                          ? "bg-red-100"
                          : "bg-[#f7efe7]"
                       }
                     `}>
                      {isSelected ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          status === "cancelled" ? "bg-red-500" :
                          status === "refunded" ? "bg-orange-500" :
                          status === "delivered" ? "bg-green-500" :
                          status === "shipped" ? "bg-blue-500" :
                           status === "preparing" ? "bg-stone-500" :
                           status === "confirmed" ? "bg-amber-500" :
                           "bg-stone-400"
                         }`} />
                       )}
                     </div>

                     {/* Label & Description */}
                     <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{config?.label}</p>
                        <p className="text-xs text-stone-500 truncate">{config?.description}</p>
                     </div>
                   </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      )}
    </>
  );
}
