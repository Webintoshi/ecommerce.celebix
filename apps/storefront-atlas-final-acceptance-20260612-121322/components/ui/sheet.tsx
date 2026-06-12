"use client";

import * as React from "react";
import { Dialog, DialogBackdrop, DialogTitle } from "@headlessui/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  return (
    <Dialog open={open} onClose={onOpenChange} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 overflow-hidden pointer-events-auto">
          {open && children}
        </div>
      </div>
    </Dialog>
  );
}

interface SheetContentProps {
  side?: "left" | "right" | "top" | "bottom";
  className?: string;
  children: React.ReactNode;
}

export function SheetContent({ side = "right", className, children }: SheetContentProps) {
  const sideClasses = {
    left: "left-0 top-0 h-full border-r",
    right: "right-0 top-0 h-full border-l",
    top: "top-0 left-0 w-full border-b",
    bottom: "bottom-0 left-0 w-full border-t",
  };

  return (
    <div
      className={cn(
        "fixed inset-y-0 bg-white shadow-xl pointer-events-auto",
        sideClasses[side],
        className
      )}
    >
      {children}
    </div>
  );
}

export function SheetHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

export function SheetTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <DialogTitle className={cn("text-lg font-bold text-gray-900", className)}>
      {children}
    </DialogTitle>
  );
}

interface SheetTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export function SheetTrigger({ asChild, children }: SheetTriggerProps) {
  return <>{children}</>;
}
