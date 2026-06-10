import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type OwnerTone = "accent" | "neutral" | "success" | "warning" | "danger" | "legacy" | "ink";

function getPillToneClass(tone: OwnerTone) {
  if (tone === "accent") {
    return "pill-accent";
  }

  if (tone === "success") {
    return "pill-success";
  }

  if (tone === "warning") {
    return "pill-warning";
  }

  if (tone === "danger") {
    return "pill-danger";
  }

  if (tone === "legacy") {
    return "pill-legacy";
  }

  if (tone === "ink") {
    return "pill-ink";
  }

  return "";
}

function getSectionToneClass(tone: OwnerTone) {
  return tone === "neutral" ? "" : `tone-${tone}`;
}

interface OwnerPageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  chips?: ReactNode;
  aside?: ReactNode;
  className?: string;
}

export function OwnerPageHeader({
  eyebrow,
  title,
  copy,
  actions,
  chips,
  aside,
  className = "",
}: OwnerPageHeaderProps) {
  return (
    <section className={`owner-page-header-card ${className}`.trim()}>
      <div className="owner-page-header-main">
        {eyebrow ? <span className="owner-page-eyebrow">{eyebrow}</span> : null}
        <div className="owner-page-header-copy">
          <h1>{title}</h1>
          {copy ? <p>{copy}</p> : null}
        </div>
        {chips ? <div className="owner-page-chip-row">{chips}</div> : null}
        {actions ? <div className="actions owner-page-header-actions">{actions}</div> : null}
      </div>
      {aside ? <aside className="owner-page-header-aside">{aside}</aside> : null}
    </section>
  );
}

export function OwnerSectionCard({
  eyebrow,
  title,
  copy,
  actions,
  tone = "neutral",
  className = "",
  children,
}: {
  eyebrow?: string;
  title?: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  tone?: OwnerTone;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`owner-section-card ${getSectionToneClass(tone)} ${className}`.trim()}>
      {title || copy || actions || eyebrow ? (
        <div className="owner-section-card-head">
          <div>
            {eyebrow ? <span className="owner-section-eyebrow">{eyebrow}</span> : null}
            {title ? <div className="card-title owner-section-card-title">{title}</div> : null}
            {copy ? <p className="section-copy">{copy}</p> : null}
          </div>
          {actions ? <div className="actions compact-actions wrap">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function OwnerKpiCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: OwnerTone;
}) {
  return (
    <article className={`owner-kpi-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

export function OwnerStatusChip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: OwnerTone;
  className?: string;
}) {
  return <span className={`pill ${getPillToneClass(tone)} ${className}`.trim()}>{children}</span>;
}

export const StatusBadge = OwnerStatusChip;

export function ServiceStatusCard({
  name,
  status,
  description,
  checkedAt,
  tone = "neutral",
  details,
}: {
  name: string;
  status: ReactNode;
  description: ReactNode;
  checkedAt?: ReactNode;
  tone?: OwnerTone;
  details?: ReactNode;
}) {
  return (
    <article className={`service-status-card tone-${tone}`}>
      <div className="service-status-head">
        <strong>{name}</strong>
        <OwnerStatusChip tone={tone}>{status}</OwnerStatusChip>
      </div>
      <p>{description}</p>
      <div className="service-status-foot">
        <span>Son kontrol</span>
        <strong>{checkedAt || "-"}</strong>
      </div>
      {details ? <TechnicalDetailsDisclosure title="Detay">{details}</TechnicalDetailsDisclosure> : null}
    </article>
  );
}

export function StoreStatusCard({
  title,
  label,
  status,
  tone = "neutral",
  checkedAt,
  action,
}: {
  title: string;
  label: ReactNode;
  status: ReactNode;
  tone?: OwnerTone;
  checkedAt?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <article className={`store-status-card tone-${tone}`}>
      <div className="store-status-card-top">
        <span>{title}</span>
        <OwnerStatusChip tone={tone}>{status}</OwnerStatusChip>
      </div>
      <strong>{label}</strong>
      <small>{checkedAt ? <>Son kontrol: {checkedAt}</> : "Son kontrol: -"}</small>
      {action ? <div className="store-status-card-action">{action}</div> : null}
    </article>
  );
}

export function DeploymentCard({
  title,
  status,
  tone = "neutral",
  rows,
  note,
  actions,
}: {
  title: string;
  status: ReactNode;
  tone?: OwnerTone;
  rows: Array<{ label: string; value: ReactNode }>;
  note?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className={`deployment-card tone-${tone}`}>
      <div className="deployment-card-head">
        <strong>{title}</strong>
        <OwnerStatusChip tone={tone}>{status}</OwnerStatusChip>
      </div>
      <div className="deployment-card-grid">
        {rows.map((row) => (
          <span key={row.label}>
            {row.label}
            <strong>{row.value || "-"}</strong>
          </span>
        ))}
      </div>
      {note ? <p>{note}</p> : null}
      {actions ? <div className="actions compact-actions wrap">{actions}</div> : null}
    </article>
  );
}

export function RuntimeMetadataCard({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: OwnerTone }>;
}) {
  return (
    <div className="runtime-metadata-grid">
      {items.map((item) => (
        <article key={item.label} className={`runtime-metadata-item tone-${item.tone ?? "neutral"}`}>
          <span>{item.label}</span>
          <strong>{item.value || "-"}</strong>
        </article>
      ))}
    </div>
  );
}

export function SmokeResultTable({
  rows,
}: {
  rows: Array<{
    route: string;
    expected: string;
    actual: ReactNode;
    passed: boolean | null;
    checkedAt?: ReactNode;
  }>;
}) {
  return (
    <div className="smoke-result-table-wrap">
      <table className="smoke-result-table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Result</th>
            <th>Last checked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.route}>
              <td>{row.route}</td>
              <td>{row.expected}</td>
              <td>{row.actual}</td>
              <td>
                <OwnerStatusChip tone={row.passed === null ? "neutral" : row.passed ? "success" : "danger"}>
                  {row.passed === null ? "Not checked" : row.passed ? "PASS" : "FAIL"}
                </OwnerStatusChip>
              </td>
              <td>{row.checkedAt || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreflightChecklist({
  items,
}: {
  items: Array<{ label: string; ready: boolean; note?: ReactNode }>;
}) {
  return (
    <div className="preflight-checklist">
      {items.map((item) => (
        <article key={item.label} className={item.ready ? "is-ready" : "is-blocked"}>
          <span aria-hidden="true" />
          <div>
            <strong>{item.label}</strong>
            {item.note ? <p>{item.note}</p> : null}
          </div>
          <OwnerStatusChip tone={item.ready ? "success" : "danger"}>{item.ready ? "Ready" : "Blocked"}</OwnerStatusChip>
        </article>
      ))}
    </div>
  );
}

export function TechnicalDetailsDisclosure({
  title = "Technical details",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="owner-technical-details control-technical-details">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

type ActionTone = "primary" | "secondary" | "ghost";

interface OwnerActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  tone?: ActionTone;
  className?: string;
  children: ReactNode;
}

export function OwnerActionButton({
  href,
  tone = "secondary",
  className = "",
  children,
  disabled,
  type = "button",
  ...buttonProps
}: OwnerActionButtonProps) {
  const classes = `button button-${tone} ${className}`.trim();

  if (href && !disabled) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  if (href && disabled) {
    return (
      <span className={classes} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <button type={type} disabled={disabled} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}

export function OwnerEntityRow({
  title,
  subtitle,
  meta,
  tags,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="owner-entity-row">
      <div className="owner-entity-copy">
        <strong>{title}</strong>
        {subtitle ? <p>{subtitle}</p> : null}
        {tags ? <div className="owner-entity-tags">{tags}</div> : null}
      </div>
      {meta ? <div className="owner-entity-meta">{meta}</div> : null}
      {actions ? <div className="owner-entity-actions">{actions}</div> : null}
    </article>
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

export function OwnerPreviewBanner({ title, message }: { title: string; message: string }) {
  return (
    <section className="preview-banner owner-preview-banner">
      <div className="preview-banner-chip">{title}</div>
      <div className="preview-banner-copy">
        <strong>Önizleme Modu aktif.</strong>
        <p>{message}</p>
      </div>
    </section>
  );
}

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
  panelTitle = "Komut özeti",
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

        {chips ? <div className="hero-chip-row">{chips}</div> : null}
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
      </aside>
    </section>
  );
}

export const OwnerMetricCard = OwnerKpiCard;

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
  tone?: OwnerTone;
  children?: ReactNode;
}) {
  return (
    <OwnerSectionCard title={title} copy={copy} actions={actions} tone={tone} className="owner-action-panel">
      {children}
    </OwnerSectionCard>
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
    <OwnerSectionCard title={title} copy={copy} actions={actions} className="owner-data-shell">
      {children}
    </OwnerSectionCard>
  );
}

export function OwnerDataList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`owner-data-list ${className}`.trim()}>{children}</div>;
}

export function OwnerActionQueue({
  items,
  empty,
  className = "",
}: {
  items: Array<{
    id: string;
    title: ReactNode;
    detail?: ReactNode;
    meta?: ReactNode;
    chips?: ReactNode;
    actions?: ReactNode;
    tone?: OwnerTone;
  }>;
  empty?: ReactNode;
  className?: string;
}) {
  if (items.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <div className={`owner-action-queue ${className}`.trim()}>
      {items.map((item) => (
        <article key={item.id} className={`owner-action-queue-item tone-${item.tone ?? "neutral"}`}>
          <div className="owner-action-queue-copy">
            <strong>{item.title}</strong>
            {item.detail ? <p>{item.detail}</p> : null}
            {item.chips ? <div className="owner-action-queue-tags">{item.chips}</div> : null}
          </div>
          {item.meta ? <div className="owner-action-queue-meta">{item.meta}</div> : null}
          {item.actions ? <div className="owner-action-queue-actions">{item.actions}</div> : null}
        </article>
      ))}
    </div>
  );
}

export function OwnerTimeline({
  items,
  empty,
  className = "",
}: {
  items: Array<{
    id: string;
    title: ReactNode;
    detail?: ReactNode;
    meta?: ReactNode;
    chips?: ReactNode;
  }>;
  empty?: ReactNode;
  className?: string;
}) {
  if (items.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <div className={`owner-timeline ${className}`.trim()}>
      {items.map((item, index) => (
        <article key={item.id} className="owner-timeline-item">
          <span className={`owner-timeline-dot ${index === 0 ? "is-current" : ""}`} />
          <div className="owner-timeline-copy">
            <strong>{item.title}</strong>
            {item.detail ? <p>{item.detail}</p> : null}
            {item.chips ? <div className="owner-timeline-tags">{item.chips}</div> : null}
          </div>
          {item.meta ? <div className="owner-timeline-meta">{item.meta}</div> : null}
        </article>
      ))}
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
