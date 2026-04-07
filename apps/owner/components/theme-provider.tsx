"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

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

export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    setMounted(true);
    
    const storedTheme = localStorage.getItem("owner-theme") as Theme | null;
    const initialTheme = storedTheme || defaultTheme;
    
    setThemeState(initialTheme);
    
    // Resolve the actual theme (handle 'system')
    const resolved = resolveTheme(initialTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved, disableTransitionOnChange);
  }, [defaultTheme, disableTransitionOnChange]);

  // Listen for system preference changes
  useEffect(() => {
    if (!enableSystem || theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? "dark" : "light";
      setResolvedTheme(newTheme);
      applyTheme(newTheme, disableTransitionOnChange);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, enableSystem, disableTransitionOnChange]);

  function resolveTheme(theme: Theme): "light" | "dark" {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }

  function applyTheme(newTheme: "light" | "dark", disableTransition: boolean) {
    const root = document.documentElement;
    
    if (disableTransition) {
      root.style.transition = "none";
    }
    
    root.setAttribute("data-theme", newTheme);
    root.style.colorScheme = newTheme;
    
    if (disableTransition) {
      // Force reflow
      void root.offsetHeight;
      root.style.transition = "";
    }
  }

  function setTheme(newTheme: Theme) {
    setThemeState(newTheme);
    localStorage.setItem("owner-theme", newTheme);
    
    const resolved = resolveTheme(newTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved, disableTransitionOnChange);
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return <>{children}</>;
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
