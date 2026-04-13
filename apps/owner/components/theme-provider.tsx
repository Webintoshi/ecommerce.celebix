"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

function readStoredTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem("owner-theme");
    return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
      ? storedTheme
      : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem("owner-theme", theme);
  } catch {
    // Ignore storage failures and continue with in-memory theme state.
  }
}

function resolveTheme(themeMode: Theme): "light" | "dark" {
  if (themeMode === "system") {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  return themeMode;
}

function applyTheme(nextResolvedTheme: "light" | "dark", themeMode: Theme, disableTransition: boolean) {
  const root = document.documentElement;

  if (disableTransition) {
    root.style.transition = "none";
  }

  root.setAttribute("data-theme", nextResolvedTheme);
  root.setAttribute("data-theme-mode", themeMode);
  root.style.colorScheme = nextResolvedTheme;

  if (disableTransition) {
    void root.offsetHeight;
    root.style.transition = "";
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const initialTheme = readStoredTheme() || defaultTheme;

    setThemeState(initialTheme);

    const resolved = resolveTheme(initialTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved, initialTheme, disableTransitionOnChange);
  }, [defaultTheme, disableTransitionOnChange]);

  useEffect(() => {
    if (!enableSystem || theme !== "system") return;

    let mediaQuery: MediaQueryList;

    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      const nextResolvedTheme = event.matches ? "dark" : "light";
      setResolvedTheme(nextResolvedTheme);
      applyTheme(nextResolvedTheme, "system", disableTransitionOnChange);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, enableSystem, disableTransitionOnChange]);

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
    writeStoredTheme(nextTheme);

    const nextResolvedTheme = resolveTheme(nextTheme);
    setResolvedTheme(nextResolvedTheme);
    applyTheme(nextResolvedTheme, nextTheme, disableTransitionOnChange);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
