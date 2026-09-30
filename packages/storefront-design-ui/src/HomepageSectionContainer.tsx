import type { ReactNode } from "react";
import type { HomepageSectionStyle } from "@celebix/saas-contracts";

export function HomepageSectionContainer({ style, children }: Readonly<{ style?: HomepageSectionStyle; children: ReactNode }>) {
  if (!style || children === null) return children;
  return <div className="celebix-store-section" data-section-background={style.background} data-section-width={style.width} data-section-spacing={style.spacing}>
    <div className="celebix-store-section-content">{children}</div>
  </div>;
}
