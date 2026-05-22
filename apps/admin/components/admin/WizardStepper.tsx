import { cn } from "@/lib/utils";

export function WizardStepper({
  steps,
  currentStep,
}: {
  steps: Array<{ id: string; label: string }>;
  currentStep: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const active = step.id === currentStep;
        return (
          <div
            key={step.id}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium",
              active
                ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent)] text-white shadow-[0_10px_20px_rgba(255,106,0,0.18)]"
                : "border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)]",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                active ? "bg-white/20 text-white" : "bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]",
              )}
            >
              {index + 1}
            </span>
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
