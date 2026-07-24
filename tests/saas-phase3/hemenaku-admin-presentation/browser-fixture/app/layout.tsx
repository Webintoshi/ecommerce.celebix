import type { ReactNode } from "react";
import "../../../../../apps/customer-panel/app/globals.css";
import "./fixture.css";

export default function BrowserFixtureLayout({ children }: { children: ReactNode }) {
  return <html lang="tr"><body>{children}</body></html>;
}
