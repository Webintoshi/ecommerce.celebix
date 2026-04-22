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
        "overflow-hidden rounded-[20px] border border-[var(--admin-border)] bg-gradient-to-br from-white via-[#fbfcfe] to-[var(--admin-bg)] shadow-[0_14px_40px_rgba(17,24,39,0.07)] md:rounded-[28px]",
        className,
      )}
    >
      {header ? <div className="border-b border-[var(--admin-border)] px-4 py-4 md:px-6 md:py-5">{header}</div> : null}
      <div className="p-4 md:p-6">{children}</div>
      {footer ? <div className="border-t border-[var(--admin-border)] bg-[rgba(247,248,250,0.92)] px-4 py-4 md:px-6">{footer}</div> : null}
    </section>
  );
}
