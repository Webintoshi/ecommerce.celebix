"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminWizardStep } from "@/types/admin-product-wizard";

interface WizardStepperProps {
  steps: AdminWizardStep[];
  currentStep: number;
  onStepClick: (stepId: number) => void;
  allowFutureSteps?: boolean;
}

export function WizardStepper({ steps, currentStep, onStepClick, allowFutureSteps = false }: WizardStepperProps) {
  return (
    <div className="w-full overflow-x-auto scrollbar-hide">
      <div className="flex min-w-max items-center gap-3 rounded-[28px] border border-[var(--admin-border)] bg-white px-3 py-3 shadow-[0_18px_40px_rgba(72,36,8,0.06)] md:gap-4 md:px-4">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isUpcoming = currentStep < step.id;
          const isLocked = isUpcoming && !allowFutureSteps;

            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => onStepClick(step.id)}
                  className={cn(
                    "group flex items-center gap-3 rounded-[22px] border px-4 py-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f1ea]",
                    isCurrent
                      ? "border-[var(--admin-accent-border)] bg-gradient-to-r from-[#fff3e8] to-white shadow-[0_12px_28px_rgba(255,106,0,0.14)]"
                    : isCompleted
                      ? "border-[var(--admin-border)] bg-white hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)]"
                      : isLocked
                        ? "cursor-not-allowed border-transparent bg-transparent opacity-60"
                        : "border-transparent bg-white/70 text-stone-600 hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)]"
                  )}
                  disabled={isLocked}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-disabled={isLocked ? true : undefined}
                  aria-label={`${step.id}. adım: ${step.title}`}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold transition-all",
                      isCurrent
                        ? "bg-[var(--admin-accent)] text-white shadow-[0_12px_24px_rgba(255,106,0,0.24)]"
                      : isCompleted
                        ? "bg-emerald-500 text-white shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
                        : "bg-[#f2e9e0] text-stone-500"
                    )}
                  >
                    {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    step.id
                  )}
                </div>

                  <div className="hidden sm:block text-left">
                    <p
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-[0.22em]",
                        isCurrent ? "text-[var(--admin-accent)]" : isCompleted ? "text-stone-700" : "text-stone-500"
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="max-w-[140px] truncate text-[11px] text-stone-400">
                      {step.description}
                    </p>
                  </div>
                </button>

                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "mx-1 h-px w-8 transition-colors sm:mx-2 sm:w-10",
                      isCompleted ? "bg-[var(--admin-accent)]/35" : "bg-[#e7ddd3]"
                    )}
                  />
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
