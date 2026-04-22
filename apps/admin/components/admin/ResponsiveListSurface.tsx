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
        "overflow-hidden rounded-[22px] border border-[var(--admin-border)] bg-gradient-to-br from-white via-[#fbfcfe] to-[var(--admin-bg)] shadow-[0_14px_40px_rgba(17,24,39,0.07)] md:rounded-[28px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
