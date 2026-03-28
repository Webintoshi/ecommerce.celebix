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
      <div className="flex items-center justify-between min-w-max px-2 py-2">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isUpcoming = currentStep < step.id;

          return (
            <div key={step.id} className="flex items-center">
              {/* Step Button */}
              <button
                onClick={() => onStepClick(step.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-xl transition-all",
                  isCurrent
                    ? "bg-primary/10"
                    : isCompleted
                      ? "hover:bg-gray-50"
                      : "opacity-50 cursor-not-allowed"
                )}
                disabled={isUpcoming}
              >
                {/* Step Number / Check */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    isCurrent
                      ? "bg-primary text-white shadow-lg shadow-primary/20"
                      : isCompleted
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-200 text-gray-500"
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    step.id
                  )}
                </div>

                {/* Step Info */}
                <div className="hidden sm:block text-left">
                  <p
                    className={cn(
                      "text-xs font-bold uppercase tracking-wider",
                      isCurrent ? "text-primary" : "text-gray-600"
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate max-w-[120px]">
                    {step.description}
                  </p>
                </div>
              </button>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "w-8 sm:w-12 h-0.5 mx-1 sm:mx-2 transition-colors",
                    isCompleted ? "bg-emerald-500" : "bg-gray-200"
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
