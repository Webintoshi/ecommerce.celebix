import type { KeyboardEvent, ReactNode, RefObject } from "react";

type PaymentTab<T extends string> = Readonly<{
  value: T;
  label: ReactNode;
  ref?: RefObject<HTMLButtonElement | null>;
}>;

export function PaymentTabs<T extends string>({ id, label, className, tabs, value, onChange }: Readonly<{
  id: string;
  label: string;
  className: string;
  tabs: readonly PaymentTab<T>[];
  value: T;
  onChange(value: T): void;
}>) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft": nextIndex = (index - 1 + tabs.length) % tabs.length; break;
      case "ArrowRight": nextIndex = (index + 1) % tabs.length; break;
      case "Home": nextIndex = 0; break;
      case "End": nextIndex = tabs.length - 1; break;
      default: return;
    }
    const next = tabs[nextIndex];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    event.currentTarget.ownerDocument.getElementById(`${id}-tab-${next.value}`)?.focus();
  }

  return <div className={className} role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button
      key={tab.value}
      ref={tab.ref}
      id={`${id}-tab-${tab.value}`}
      type="button"
      role="tab"
      aria-controls={`${id}-panel-${tab.value}`}
      aria-selected={value === tab.value}
      tabIndex={value === tab.value ? 0 : -1}
      onClick={() => onChange(tab.value)}
      onKeyDown={(event) => onKeyDown(event, index)}
    >{tab.label}</button>)}
  </div>;
}
