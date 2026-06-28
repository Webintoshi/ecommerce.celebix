import { cn } from "@/lib/utils";

export function ResponsiveListSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--shadow-xs)] md:rounded-[12px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
