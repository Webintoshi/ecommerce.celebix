import localFont from "next/font/local";

export const panelFont = localFont({
  src: "../app/fonts/urbanist-variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-panel",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "Arial", "sans-serif"],
});
