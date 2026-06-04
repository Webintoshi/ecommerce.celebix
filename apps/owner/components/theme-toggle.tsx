"use client";

import type { CSSProperties, ReactElement } from "react";
import { useTheme } from "./theme-provider";

type Theme = "light" | "dark" | "system";

const OPTIONS: Array<{
  value: Theme;
  label: string;
  shortLabel: string;
  icon: ReactElement;
}> = [
  {
    value: "light",
    label: "Gündüz modu",
    shortLabel: "Gündüz",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4.5" />
        <line x1="12" y1="2.5" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="21.5" />
        <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
        <line x1="2.5" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="21.5" y2="12" />
        <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
        <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
      </svg>
    )
  },
  {
    value: "dark",
    label: "Gece modu",
    shortLabel: "Gece",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 13.2a8.8 8.8 0 1 1-10.2-10A7 7 0 0 0 21 13.2Z" />
      </svg>
    )
  },
  {
    value: "system",
    label: "Sistem modunu takip et",
    shortLabel: "Sistem",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </svg>
    )
  }
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const activeIndex = OPTIONS.findIndex((option) => option.value === theme);

  return (
    <div
      className="theme-toggle-control"
      role="radiogroup"
      aria-label="Tema secimi"
      style={{ "--active-index": String(activeIndex < 0 ? 0 : activeIndex) } as CSSProperties}
    >
      <span className="theme-toggle-indicator" aria-hidden />
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`theme-toggle-option${active ? " is-active" : ""}`}
            title={option.label}
            onClick={() => setTheme(option.value)}
          >
            <span className="theme-toggle-icon">{option.icon}</span>
            <span className="theme-toggle-label">{option.shortLabel}</span>
            {option.value === "system" ? <span className="theme-toggle-meta">{resolvedTheme}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
