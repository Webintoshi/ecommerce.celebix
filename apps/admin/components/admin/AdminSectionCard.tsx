import { cn } from "@/lib/utils";

export function AdminSectionCard({
  children,
  className,
  header,
  footer,
}: {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[22px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_14px_40px_rgba(15,23,42,0.08)] md:rounded-[28px]",
        className,
      )}
    >
      {header ? <div className="border-b border-[#FE6100]/8 px-4 py-4 md:px-6 md:py-5">{header}</div> : null}
      <div className="p-4 md:p-6">{children}</div>
      {footer ? <div className="border-t border-[#FE6100]/8 bg-[#fff8f3]/80 px-4 py-4 md:px-6">{footer}</div> : null}
    </section>
  );
}
