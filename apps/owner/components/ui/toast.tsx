"use client";

import { cn } from "@/lib/utils";
import { Toast as ToastType } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

interface ToastProps {
  toast: ToastType;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(handleRemove, toast.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const toneClasses = {
    success: (
      <svg className="h-5 w-5 text-[#A64A12]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="h-5 w-5 text-[#6A3B1E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg className="h-5 w-5 text-[#C95D0D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="h-5 w-5 text-[#FE6100]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  const borders = {
    success: "border-[#DFB699]",
    error: "border-[#D4B09B]",
    warning: "border-[#E0A06B]",
    info: "border-[rgba(254,97,0,0.24)]"
  };

  return (
    <div
      className={cn(
        "flex w-full max-w-sm items-start gap-3 rounded-xl border bg-[#FFF9F4] p-4 shadow-[0_18px_40px_rgba(43,43,43,0.12)]",
        "transition-all duration-300",
        isExiting ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0",
        borders[toast.type]
      )}
    >
      <div className="flex-shrink-0">{toneClasses[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#2B2B2B]">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-sm font-medium text-[#6E6258]">{toast.description}</p>
        )}
      </div>
      <button
        onClick={handleRemove}
        className="flex-shrink-0 text-[#9E8B7B] transition-colors hover:text-[#2B2B2B]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

export { ToastItem, ToastContainer };
