import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

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
    <section className="overflow-hidden rounded-[24px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--shadow-md)] md:rounded-[28px]">
      <div className="border-b border-[var(--admin-border)] px-4 py-4 md:px-6 md:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {badge ? (
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)] md:text-[11px]">
                {badge}
              </div>
            ) : null}
            <h1 className="mt-3 text-[1.95rem] font-semibold tracking-[-0.045em] text-[var(--admin-heading)] md:text-[2.25rem]">
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

export function AdminPanel({
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
        "overflow-hidden rounded-[22px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--shadow-md)] md:rounded-[28px]",
        className,
      )}
    >
      {header ? <div className="border-b border-[var(--admin-border)] px-4 py-4 md:px-6 md:py-5">{header}</div> : null}
      <div className="p-4 md:p-6">{children}</div>
      {footer ? <div className="border-t border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-4 md:px-6">{footer}</div> : null}
    </section>
  );
}

export function AdminToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[22px] border border-[var(--admin-border)] bg-white p-3 md:flex-row md:items-center md:justify-between md:p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminSearchInput({
  className,
  inputClassName,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  inputClassName?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-text-muted)]" />
      <input
        {...props}
        className={cn(
          "h-12 w-full rounded-2xl border border-[var(--admin-border)] bg-white py-3 pl-11 pr-4 text-sm text-[var(--admin-heading)] outline-none transition placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]",
          inputClassName,
        )}
      />
    </label>
  );
}

export function AdminBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger" | "info";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        tone === "accent" && "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
        tone === "success" && "border-[color-mix(in_srgb,var(--admin-success)_22%,white)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
        tone === "danger" && "border-[color-mix(in_srgb,var(--admin-danger)_18%,white)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
        tone === "info" && "border-[color-mix(in_srgb,var(--admin-info)_18%,white)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
        tone === "neutral" && "border-[var(--admin-border)] bg-[#F9FAFB] text-[var(--admin-text-secondary)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AdminActionButton({
  children,
  tone = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-55",
        tone === "primary" && "bg-[var(--admin-accent)] text-white shadow-[0_12px_28px_rgba(255,106,0,0.22)] hover:bg-[var(--admin-accent-hover)]",
        tone === "secondary" && "border border-[var(--admin-border)] bg-white text-[var(--admin-text)] hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]",
        tone === "danger" && "border border-[color-mix(in_srgb,var(--admin-danger)_18%,white)] bg-white text-[var(--admin-danger)] hover:bg-[var(--admin-danger-soft)]",
        tone === "ghost" && "text-[var(--admin-text-secondary)] hover:bg-[#F9FAFB] hover:text-[var(--admin-heading)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AdminEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[24px] border border-dashed border-[var(--admin-border)] bg-[#FCFDFE] px-5 py-10 text-center", className)}>
      {icon ? <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]">{icon}</div> : null}
      <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--admin-text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function AdminSkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[22px] border border-[var(--admin-border)] bg-[#FCFDFE] p-5", className)} />;
}
