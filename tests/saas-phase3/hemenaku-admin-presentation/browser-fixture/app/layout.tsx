import type { ReactNode } from "react";
import { panelFont } from "../../../../../apps/customer-panel/lib/panel-font";
import "../../../../../apps/customer-panel/app/globals.css";
import "./fixture.css";

export default function BrowserFixtureLayout({ children }: { children: ReactNode }) {
  return <html lang="tr" className={panelFont.variable}><body>{children}</body></html>;
}
