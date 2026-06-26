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
    <nav className="w-full overflow-x-auto scrollbar-hide" aria-label="Ürün düzenleme adımları">
      <div className="flex min-w-max items-stretch border-y border-[var(--admin-border)] bg-[#F9F9F9]">
        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isUpcoming = currentStep < step.id;
          const isLocked = isUpcoming && !allowFutureSteps;

            return (
              <div key={step.id} className="flex items-stretch">
                <button
                  onClick={() => onStepClick(step.id)}
                  className={cn(
                    "group relative flex min-h-[58px] items-center gap-3 border-r border-[var(--admin-border)] px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/30 focus-visible:ring-inset md:px-5",
                    isCurrent
                      ? "bg-white text-[var(--admin-heading)]"
                    : isCompleted
                      ? "bg-white text-[var(--admin-heading)] hover:bg-[var(--admin-accent-soft)]"
                      : isLocked
                        ? "cursor-not-allowed bg-[#F9F9F9] text-[var(--admin-text-muted)] opacity-70"
                        : "bg-[#F9F9F9] text-[var(--admin-text-secondary)] hover:bg-white"
                  )}
                  disabled={isLocked}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-disabled={isLocked ? true : undefined}
                  aria-label={`${step.id}. adım: ${step.title}`}
                >
                  {isCurrent ? (
                    <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--admin-accent)]" aria-hidden="true" />
                  ) : null}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border text-xs font-bold transition-colors",
                      isCurrent
                        ? "border-[var(--admin-accent)] bg-[var(--admin-accent)] text-white"
                      : isCompleted
                        ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]"
                        : "border-[var(--admin-border)] bg-white text-[var(--admin-text-muted)]"
                    )}
                  >
                    {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    step.id
                  )}
                </div>

                  <div className="min-w-[9.5rem]">
                    <p
                      className={cn(
                        "text-sm font-semibold leading-5",
                        isCurrent ? "text-[var(--admin-heading)]" : isCompleted ? "text-[var(--admin-heading)]" : "text-[var(--admin-text-secondary)]"
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="max-w-[160px] truncate text-xs text-[var(--admin-text-muted)]">
                      {step.description}
                    </p>
                  </div>
                </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
