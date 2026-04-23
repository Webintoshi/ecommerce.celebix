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
        "overflow-hidden rounded-[22px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--shadow-md)] md:rounded-[28px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
