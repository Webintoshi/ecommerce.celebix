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
        "overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--shadow-xs)] md:rounded-[12px]",
        className,
      )}
    >
      {header ? <div className="border-b border-[var(--admin-border)] px-4 py-4 md:px-6 md:py-5">{header}</div> : null}
      <div className="p-4 md:p-6">{children}</div>
      {footer ? <div className="border-t border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-4 md:px-6">{footer}</div> : null}
    </section>
  );
}
