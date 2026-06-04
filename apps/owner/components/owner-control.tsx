import type { ReactNode } from "react";

type Tone = "accent" | "neutral" | "success" | "warning" | "danger" | "legacy" | "ink";

interface OwnerCommandHeroProps {
  overline: string;
  title: ReactNode;
  copy: ReactNode;
  actions?: ReactNode;
  metrics?: Array<{
    label: string;
    value: ReactNode;
    note?: ReactNode;
  }>;
  panelTitle?: string;
  panelItems?: Array<{
    label: string;
    value: ReactNode;
  }>;
  chips?: ReactNode;
  children?: ReactNode;
}

export function OwnerCommandHero({
  overline,
  title,
  copy,
  actions,
  metrics = [],
  panelTitle = "Komuta ozeti",
  panelItems = [],
  chips,
  children,
}: OwnerCommandHeroProps) {
  return (
    <section className="owner-command-hero">
      <div className="owner-command-hero-content">
        <div className="hero-stack">
          <span className="hero-overline">{overline}</span>
          <div>
            <h1>{title}</h1>
            <p>{copy}</p>
          </div>
        </div>

        {metrics.length > 0 ? (
          <div className="hero-quick-metrics owner-hero-metrics">
            {metrics.map((metric) => (
              <div key={metric.label} className="hero-kpi owner-hero-kpi">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                {metric.note ? <small>{metric.note}</small> : null}
              </div>
            ))}
          </div>
        ) : null}

        {actions ? <div className="actions hero-actions">{actions}</div> : null}
        {children}
      </div>

      <aside className="dashboard-hero-panel owner-command-panel">
        <div className="card-title">{panelTitle}</div>
        {panelItems.length > 0 ? (
          <div className="hero-list">
            {panelItems.map((item) => (
              <div key={item.label} className="hero-list-item">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {chips ? <div className="hero-chip-row">{chips}</div> : null}
      </aside>
    </section>
  );
}

export function OwnerMetricCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={`owner-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export function OwnerStatusChip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const toneClass =
    tone === "accent"
      ? "pill-accent"
      : tone === "success"
        ? "pill-success"
        : tone === "warning"
          ? "pill-warning"
          : tone === "danger"
            ? "pill-danger"
            : tone === "legacy"
              ? "pill-legacy"
              : tone === "ink"
                ? "pill-ink"
                : "";

  return <span className={`pill ${toneClass} ${className}`.trim()}>{children}</span>;
}

export function OwnerLifecycleStepper({
  steps,
}: {
  steps: Array<{
    label: string;
    detail?: ReactNode;
    state: "done" | "current" | "pending" | "blocked";
  }>;
}) {
  return (
    <div className="owner-lifecycle-stepper">
      {steps.map((step, index) => (
        <div key={step.label} className={`owner-lifecycle-step is-${step.state}`}>
          <span className="owner-step-index">{index + 1}</span>
          <div>
            <strong>{step.label}</strong>
            {step.detail ? <p>{step.detail}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OwnerSetupSignalCard({
  kicker,
  title,
  value,
  note,
  tone = "neutral",
  chips,
  footer,
}: {
  kicker: string;
  title?: ReactNode;
  value: ReactNode;
  note: ReactNode;
  tone?: "ready" | "auth" | "analytics" | "payment" | "legacy" | "cleanup" | "neutral";
  chips?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={`setup-signal-card tone-${tone}`}>
      <span className="setup-signal-kicker">{kicker}</span>
      {title ? <div className="setup-signal-title">{title}</div> : null}
      {chips ? <div className="actions compact-actions wrap stack-top-sm">{chips}</div> : null}
      <div className="setup-signal-value">{value}</div>
      <p className="setup-signal-note">{note}</p>
      {footer ? <div className="setup-signal-footer">{footer}</div> : null}
    </div>
  );
}

export function OwnerActionPanel({
  title,
  copy,
  actions,
  tone = "neutral",
  children,
}: {
  title: string;
  copy?: ReactNode;
  actions?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <section className={`owner-action-panel tone-${tone}`}>
      <div>
        <div className="card-title">{title}</div>
        {copy ? <p className="section-copy">{copy}</p> : null}
      </div>
      {actions ? <div className="actions compact-actions wrap">{actions}</div> : null}
      {children}
    </section>
  );
}

export function OwnerDataTableShell({
  title,
  copy,
  actions,
  children,
}: {
  title: string;
  copy?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="owner-data-shell">
      <div className="section-head">
        <div>
          <div className="card-title">{title}</div>
          {copy ? <p className="section-copy">{copy}</p> : null}
        </div>
        {actions ? <div className="actions compact-actions wrap">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function OwnerEmptyState({
  title,
  copy,
  action,
}: {
  title: string;
  copy?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="owner-empty-state">
      <span />
      <h3>{title}</h3>
      {copy ? <p>{copy}</p> : null}
      {action ? <div className="actions compact-actions">{action}</div> : null}
    </div>
  );
}

export function OwnerSectionHeader({
  eyebrow,
  title,
  copy,
  actions,
}: {
  eyebrow?: string;
  title: string;
  copy?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="owner-section-header">
      <div>
        {eyebrow ? <span className="owner-section-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {copy ? <p>{copy}</p> : null}
      </div>
      {actions ? <div className="actions compact-actions wrap">{actions}</div> : null}
    </div>
  );
}

export function OwnerPreviewBanner({ title, message }: { title: string; message: string }) {
  return (
    <section className="preview-banner owner-preview-banner">
      <div className="preview-banner-chip">{title}</div>
      <div className="preview-banner-copy">
        <strong>Read-only owner preview aktif.</strong>
        <p>{message}</p>
      </div>
    </section>
  );
}
