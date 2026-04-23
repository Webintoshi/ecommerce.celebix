import { cn } from "@/lib/utils";

export function AdminStatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function AdminStatCard({
  label,
  value,
  description,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "default" | "accent" | "success" | "info";
}) {
  return (
    <div
      className={cn(
        "min-h-[132px] rounded-[22px] border bg-white px-4 py-4 shadow-[0_10px_24px_rgba(17,24,39,0.04)] md:rounded-[24px] md:px-5 md:py-5",
        tone === "accent" && "border-[var(--admin-accent-border)]",
        tone === "success" && "border-[color-mix(in_srgb,var(--admin-success)_20%,white)]",
        tone === "info" && "border-[color-mix(in_srgb,var(--admin-info)_18%,white)]",
        tone === "default" && "border-[var(--admin-border)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {icon ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-[#F9FAFB] text-[var(--admin-text-secondary)]">
            {icon}
          </div>
        ) : null}
        <p
          className={cn(
            "ml-auto text-[1.8rem] font-semibold tracking-[-0.04em] md:text-[2rem]",
            tone === "accent" && "text-[var(--admin-accent-hover)]",
            tone === "success" && "text-[var(--admin-success)]",
            tone === "info" && "text-[var(--admin-info)]",
            tone === "default" && "text-[var(--admin-heading)]",
          )}
        >
          {value}
        </p>
      </div>
      <p className="mt-4 text-sm font-semibold text-[var(--admin-text)]">{label}</p>
      {description ? <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{description}</p> : null}
    </div>
  );
}
