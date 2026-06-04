"use client";

import type { ReactElement } from "react";
import { useTheme } from "./theme-provider";

type Theme = "light" | "dark" | "system";

const OPTIONS: Array<{
  value: Theme;
  label: string;
  icon: ReactElement;
}> = [
  {
    value: "light",
    label: "Açık tema",
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
    label: "Koyu tema",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 13.2a8.8 8.8 0 1 1-10.2-10A7 7 0 0 0 21 13.2Z" />
      </svg>
    )
  },
  {
    value: "system",
    label: "Sistem teması",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </svg>
    )
  }
];

function getNextTheme(current: Theme): Theme {
  if (current === "light") {
    return "dark";
  }

  if (current === "dark") {
    return "system";
  }

  return "light";
}

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const activeOption = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[0];
  const activeStateLabel = theme === "system" ? `Sistem • ${resolvedTheme === "dark" ? "Koyu" : "Açık"}` : activeOption.label;

  return (
    <button
      type="button"
      className="theme-toggle-button"
      title={`Tema değiştir. Mevcut: ${activeStateLabel}`}
      onClick={() => setTheme(getNextTheme(theme))}
    >
      <span className="theme-toggle-icon" aria-hidden>
        {activeOption.icon}
      </span>
      <span className="theme-toggle-copy">
        <span className="theme-toggle-label">{theme === "system" ? "Sistem" : activeOption.label}</span>
        <span className="theme-toggle-meta">
          {theme === "system" ? `Etkin: ${resolvedTheme === "dark" ? "Koyu" : "Açık"}` : "Tema"}
        </span>
      </span>
    </button>
  );
}
