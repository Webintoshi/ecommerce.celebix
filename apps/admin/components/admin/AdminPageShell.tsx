import { cn } from "@/lib/utils";

export function AdminPageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-5 md:space-y-7", className)}>{children}</div>;
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
    <section className="overflow-hidden rounded-[22px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_14px_40px_rgba(254,97,0,0.08)] md:rounded-[28px]">
      <div className="border-b border-[#FE6100]/8 px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {badge ? (
              <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/15 bg-[#fff6f1] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FE6100] md:text-[11px]">
                {badge}
              </div>
            ) : null}
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[2rem]">
              {title}
            </h1>
            {description ? <p className="mt-2 max-w-3xl text-sm text-gray-500 md:text-[15px]">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {metrics ? <div className="grid grid-cols-1 gap-px bg-[#FE6100]/8 sm:grid-cols-2 xl:grid-cols-4">{metrics}</div> : null}
    </section>
  );
}
