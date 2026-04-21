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
        "overflow-hidden rounded-[22px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_14px_40px_rgba(15,23,42,0.08)] md:rounded-[28px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
