import { cn } from "@/lib/utils";

export function AdminPageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-[1.8rem] md:space-y-7", className)}>{children}</div>;
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
    <section className="overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_16px_42px_rgba(254,97,0,0.09)] md:rounded-[28px]">
      <div className="border-b border-[#FE6100]/8 px-[1.15rem] py-[1.35rem] md:px-6 md:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {badge ? (
              <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/15 bg-[#fff6f1] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FE6100] md:text-[11px]">
                {badge}
              </div>
            ) : null}
            <h1 className="mt-3 text-[2.38rem] font-semibold tracking-[-0.045em] text-gray-950 md:text-[2rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2.5 max-w-3xl text-[1.02rem] leading-7 text-[#6f6258] md:text-[15px]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {metrics ? <div className="grid grid-cols-1 gap-px bg-[#FE6100]/8 sm:grid-cols-2 xl:grid-cols-4">{metrics}</div> : null}
    </section>
  );
}
