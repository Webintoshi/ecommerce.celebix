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
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border px-4 py-4 md:rounded-[24px] md:px-5 md:py-5",
        tone === "accent"
          ? "border-[#FE6100]/15 bg-[#fff6f1]"
          : "border-[#FE6100]/10 bg-white",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 md:text-[11px]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[1.85rem]">{value}</p>
    </div>
  );
}
