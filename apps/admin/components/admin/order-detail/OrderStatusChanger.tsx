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
          flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
          transition-all duration-200 border
          ${disabled || isUpdating
            ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
            : isOpen
              ? "bg-primary text-white border-primary shadow-lg"
              : "bg-white border-gray-300 text-gray-700 hover:border-primary hover:shadow-sm"
          }
        `}
      >
        <span className={`w-2 h-2 rounded-full ${
          isOpen ? "bg-white" : 
          currentStatus === "cancelled" ? "bg-red-500" :
          currentStatus === "refunded" ? "bg-orange-500" :
          currentStatus === "delivered" ? "bg-green-500" :
          "bg-blue-500"
        }`} />
        <span>{currentConfig?.label || "Bilinmiyor"}</span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu - Using Portal for fixed positioning */}
      {isOpen && !disabled && typeof document !== "undefined" && (
        createPortal(
          <div 
            ref={menuRef}
            className="fixed w-72 bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] overflow-hidden"
            style={{ 
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
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
                        ? "bg-emerald-50 text-emerald-700"
                        : isNegative
                          ? "text-red-600 hover:bg-red-50"
                          : "text-gray-700 hover:bg-gray-50"
                      }
                      ${isUpdating ? "opacity-50" : ""}
                    `}
                  >
                    {/* Icon/Indicator */}
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                      ${isSelected
                        ? "bg-emerald-100 text-emerald-600"
                        : isNegative
                          ? "bg-red-100"
                          : "bg-gray-100"
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
                          status === "preparing" ? "bg-purple-500" :
                          status === "confirmed" ? "bg-blue-400" :
                          "bg-gray-400"
                        }`} />
                      )}
                    </div>

                    {/* Label & Description */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{config?.label}</p>
                      <p className="text-xs text-gray-500 truncate">{config?.description}</p>
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
