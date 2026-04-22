import { cn } from "@/lib/utils";

export function AdminPageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4 md:space-y-7", className)}>{children}</div>;
}

export function AdminPageHeader({
  badge,
  title,
  description,
  actions,
  metrics,
}: {
  badge?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  metrics?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[var(--admin-border)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] shadow-[0_16px_38px_rgba(17,24,39,0.05)] md:rounded-[28px]">
      <div className="border-b border-[var(--admin-border)] px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {badge ? (
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)] md:text-[11px]">
                {badge}
              </div>
            ) : null}
            <h1 className="mt-3 text-[1.95rem] font-semibold tracking-[-0.045em] text-[var(--admin-heading)] md:text-[2rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2.5 hidden max-w-3xl text-[15px] leading-6 text-[var(--admin-text-secondary)] md:block">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">{actions}</div> : null}
        </div>
      </div>
      {metrics ? <div className="grid grid-cols-2 gap-px bg-[var(--admin-border)] xl:grid-cols-4">{metrics}</div> : null}
    </section>
  );
}
