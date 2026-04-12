"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminWizardStep } from "@/types/admin-product-wizard";

interface WizardStepperProps {
  steps: AdminWizardStep[];
  currentStep: number;
  onStepClick: (stepId: number) => void;
}

export function WizardStepper({ steps, currentStep, onStepClick }: WizardStepperProps) {
  return (
    <div className="w-full overflow-x-auto scrollbar-hide">
      <div className="flex min-w-max items-center gap-3 rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] px-3 py-3 shadow-[0_18px_40px_rgba(72,36,8,0.06)] md:gap-4 md:px-4">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isUpcoming = currentStep < step.id;

            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => onStepClick(step.id)}
                  className={cn(
                    "group flex items-center gap-3 rounded-[22px] border px-4 py-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f1ea]",
                    isCurrent
                      ? "border-[#FE6100]/20 bg-gradient-to-r from-[#fff3e8] to-white shadow-[0_12px_28px_rgba(254,97,0,0.14)]"
                    : isCompleted
                      ? "border-[#FE6100]/10 bg-white hover:border-[#FE6100]/18 hover:bg-[#fff8f3]"
                      : "cursor-not-allowed border-transparent bg-transparent opacity-60"
                  )}
                  disabled={isUpcoming}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`${step.id}. adım: ${step.title}`}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold transition-all",
                      isCurrent
                        ? "bg-gradient-to-r from-[#FE6100] to-[#E45700] text-white shadow-[0_12px_24px_rgba(254,97,0,0.24)]"
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
                        isCurrent ? "text-[#FE6100]" : isCompleted ? "text-stone-700" : "text-stone-500"
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
                      isCompleted ? "bg-[#FE6100]/35" : "bg-[#e7ddd3]"
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
