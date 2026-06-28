"use client";

import { AdminTopbarBridge } from "@/components/admin/AdminTopbarChrome";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentType, InputHTMLAttributes, ReactNode } from "react";

type AdminTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "purple";

export function AdminPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("min-w-0 space-y-4 xl:space-y-5", className)}>{children}</div>;
}

export function AdminPageHeader({
  badge,
  sectionLabel,
  breadcrumbs,
  title,
  description,
  actions,
  primaryAction,
  secondaryActions,
  statusSlot,
  metrics,
  className,
}: {
  badge?: string;
  sectionLabel?: string;
  breadcrumbs?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  statusSlot?: ReactNode;
  metrics?: ReactNode;
  className?: string;
}) {
  const resolvedSectionLabel = sectionLabel ?? badge;
  const resolvedActions = actions ?? (
    primaryAction || secondaryActions ? (
      <>
        {secondaryActions}
        {primaryAction}
      </>
    ) : null
  );
  const hasHeaderBody = Boolean(breadcrumbs || statusSlot || resolvedActions);

  const bridge = <AdminTopbarBridge title={title} subtitle={description} actions={resolvedActions} />;

  if (!hasHeaderBody && !metrics) {
    return bridge;
  }

  return (
    <>
      {bridge}
      <section className={cn("space-y-3", className)}>
        {breadcrumbs || statusSlot || resolvedActions ? (
          <div className="space-y-3 min-[1025px]:hidden">
            {breadcrumbs ? <div>{breadcrumbs}</div> : null}
            {resolvedSectionLabel ? (
              <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-accent-hover)] md:text-[11px]">
                {resolvedSectionLabel}
              </div>
            ) : null}
            {statusSlot ? <div className="flex flex-wrap items-center gap-2">{statusSlot}</div> : null}
            {resolvedActions ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {resolvedActions}
              </div>
            ) : null}
          </div>
        ) : null}
        {metrics ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-[var(--admin-border)] xl:grid-cols-4">
            {metrics}
          </div>
        ) : null}
      </section>
    </>
  );
}

export function AdminPanel({
  children,
  className,
  header,
  footer,
}: {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[16px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {header ? <div className="border-b border-[var(--admin-border)] px-4 py-4 sm:px-5 xl:px-6 xl:py-5">{header}</div> : null}
      <div className="p-4 sm:p-5 xl:p-6">{children}</div>
      {footer ? <div className="border-t border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-4 sm:px-5 xl:px-6">{footer}</div> : null}
    </section>
  );
}

export function AdminToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[16px] border border-[var(--admin-border)] bg-white p-3 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between xl:p-4",
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
}: InputHTMLAttributes<HTMLInputElement> & {
  inputClassName?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-text-muted)]" />
      <input
        {...props}
        className={cn(
          "h-12 w-full rounded-[14px] border border-[var(--admin-border)] bg-white py-3 pl-11 pr-4 text-sm text-[var(--admin-heading)] outline-none transition placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]",
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
  children: ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        tone === "accent" && "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
        tone === "success" && "border-[color-mix(in_srgb,var(--admin-success)_22%,white)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
        tone === "warning" && "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
        tone === "danger" && "border-[color-mix(in_srgb,var(--admin-danger)_18%,white)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
        tone === "info" && "border-[color-mix(in_srgb,var(--admin-info)_18%,white)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
        tone === "purple" && "border-[color-mix(in_srgb,var(--admin-purple)_18%,white)] bg-[var(--admin-orange-soft)] text-[var(--admin-purple)]",
        tone === "neutral" && "border-[var(--admin-border)] bg-[#F9FAFB] text-[var(--admin-text-secondary)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AdminStatusBadge({
  children,
  label,
  tone = "neutral",
  size = "md",
  className,
}: {
  children?: ReactNode;
  label?: ReactNode;
  tone?: AdminTone;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <AdminBadge
      tone={tone}
      className={cn(
        "font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-xs",
        className,
      )}
    >
      {children ?? label}
    </AdminBadge>
  );
}

export function AdminMetricCard({
  label,
  value,
  context,
  delta,
  icon: Icon,
  tone = "neutral",
  loading = false,
  compact = false,
  className,
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  delta?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: AdminTone;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-[var(--admin-border)] bg-white p-3.5 shadow-[var(--shadow-xs)] xl:p-5",
        compact ? "min-h-[104px]" : "min-h-[124px]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--admin-text-secondary)]">{label}</p>
          {loading ? (
            <div className="mt-3 h-8 w-24 animate-pulse rounded-[8px] bg-[var(--admin-muted-surface)]" />
          ) : (
            <div className={cn("mt-2 truncate font-semibold tracking-[-0.035em] text-[var(--admin-heading)]", compact ? "text-[1.3rem]" : "text-[1.55rem] xl:text-[1.8rem]")}>
              {value}
            </div>
          )}
        </div>
        {Icon ? (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border xl:h-12 xl:w-12",
              tone === "accent" && "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
              tone === "success" && "border-[color-mix(in_srgb,var(--admin-success)_20%,white)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
              tone === "warning" && "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
              tone === "danger" && "border-[color-mix(in_srgb,var(--admin-danger)_18%,white)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
              tone === "info" && "border-[color-mix(in_srgb,var(--admin-info)_18%,white)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
              tone === "purple" && "border-[color-mix(in_srgb,var(--admin-purple)_18%,white)] bg-[var(--admin-orange-soft)] text-[var(--admin-purple)]",
              tone === "neutral" && "border-[var(--admin-border)] bg-[var(--admin-muted-surface)] text-[var(--admin-text-secondary)]",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      {context || delta ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          {context ? <p className="min-w-0 truncate font-medium text-[var(--admin-text-secondary)]">{context}</p> : <span />}
          {delta ? <span className="shrink-0 rounded-full border border-[var(--admin-border)] bg-[var(--admin-muted-surface)] px-2 py-1 font-semibold text-[var(--admin-text)]">{delta}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdminDataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-[16px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminCallout({
  children,
  tone = "info",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[14px] border px-4 py-3 text-sm font-medium",
        tone === "info" && "border-[color-mix(in_srgb,var(--admin-info)_18%,white)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
        tone === "success" && "border-[color-mix(in_srgb,var(--admin-success)_20%,white)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
        tone === "warning" && "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
        tone === "danger" && "border-[color-mix(in_srgb,var(--admin-danger)_18%,white)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
        tone === "neutral" && "border-[var(--admin-border)] bg-[var(--admin-muted-surface)] text-[var(--admin-text-secondary)]",
        className,
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AdminLoadingState({
  label = "Kayıtlar hazırlanıyor",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center rounded-[16px] border border-[var(--admin-border)] bg-white px-5 py-12 text-sm font-medium text-[var(--admin-text-secondary)] shadow-[var(--shadow-sm)]", className)}>
      <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-[var(--admin-accent-border)] border-t-[var(--admin-accent)]" />
      {label}
    </div>
  );
}

export function AdminActionButton({
  children,
  tone = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[14px] px-3.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-55 xl:min-h-11 xl:px-4",
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
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[16px] border border-dashed border-[var(--admin-border)] bg-[var(--admin-muted-surface)] px-5 py-10 text-center", className)}>
      {icon ? <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]">{icon}</div> : null}
      <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--admin-text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function AdminSkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[16px] border border-[var(--admin-border)] bg-[#FCFDFE] p-5", className)} />;
}
