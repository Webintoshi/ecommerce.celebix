import { cn } from "@/lib/utils";

export function AdminStatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", className)}>{children}</div>;
}

export function AdminStatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-4 md:rounded-[24px] md:px-5 md:py-5",
        tone === "accent"
          ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)]"
          : "border-[var(--admin-border)] bg-white shadow-[0_10px_24px_rgba(17,24,39,0.04)]",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)] md:text-[11px]">{label}</p>
      <p className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--admin-heading)] md:text-[1.85rem]">{value}</p>
    </div>
  );
}
