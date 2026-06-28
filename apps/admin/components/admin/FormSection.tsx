import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[12px] border border-[var(--admin-border)] bg-white p-4 shadow-[0_12px_28px_rgba(17,24,39,0.04)] md:rounded-[12px] md:p-6", className)}>
      <div className="mb-4">
        <h3 className="text-base font-semibold tracking-[-0.03em] text-[var(--admin-heading)] md:text-lg">{title}</h3>
        {description ? <p className="mt-1 text-sm text-[var(--admin-text-secondary)]">{description}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4">{children}</div>
    </section>
  );
}
