import { createHash } from "node:crypto";

import type { LogtoManagementTransport } from "./logto-management-transport";

const CELEBIX_LOGO_URL =
  "https://ecommerce.celebix.co/branding/celebix-logo.svg";

export const CELEBIX_LOGTO_BRANDING = {
  color: {
    primaryColor: "#FE6100",
    darkPrimaryColor: "#FE6100",
    isDarkModeEnabled: true,
  },
  branding: {
    logoUrl: CELEBIX_LOGO_URL,
    darkLogoUrl: CELEBIX_LOGO_URL,
  },
} as const;

export const CELEBIX_LOGTO_CUSTOM_CSS = `
@font-face {
  font-family: "Plus Jakarta Sans";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url("https://fonts.gstatic.com/s/plusjakartasans/v12/LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko40yygg_vbd-E.woff2") format("woff2");
}

#app,
#app * {
  box-sizing: border-box;
  font-family: "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --color-type-primary: #2B2B2B;
  --color-type-secondary: #6B7280;
}

#app > div[class$="viewBox"] {
  min-height: 100vh;
  background: #F6F7F9;
}

#app main[class*="main"] {
  border: 1px solid #E2E7EE;
  border-radius: 16px;
  background: #FFFFFF;
  box-shadow: 0 22px 55px rgba(31, 41, 55, 0.09);
}

#app main[class*="main"] img[class*="logo"] {
  width: auto;
  max-width: 190px;
  height: auto;
  max-height: 58px;
  padding: 8px 12px;
  border: 1px solid #ECEFF3;
  border-radius: 12px;
  background: #FFFFFF;
  object-fit: contain;
}

#app h1,
#app h2,
#app h3,
#app [class*="title"] {
  color: #2B2B2B;
  letter-spacing: -0.025em;
}

#app form div[class*="inputField"] > div {
  min-height: 52px;
  border: 1px solid #DCE1E8;
  border-radius: 14px;
  background: #FFFFFF;
  box-shadow: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

#app form div[class*="inputField"] > div:focus-within {
  border-color: #FE6100;
  box-shadow: 0 0 0 4px rgba(254, 97, 0, 0.14);
}

#app form div[class*="inputField"] input,
#app form div[class*="inputField"] div[class$="countryCodeSelector"] {
  min-height: 50px;
  border-radius: 14px;
  background: #FFFFFF;
  color: #2B2B2B;
  font-size: 15px;
  font-weight: 500;
}

#app form div[class*="inputField"] input::placeholder {
  color: #9AA0A9;
}

#app button {
  min-height: 48px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

#app button[type="submit"] {
  min-height: 52px;
  border-color: #FE6100;
  background: #FE6100;
  color: #FFFFFF;
  box-shadow: 0 12px 24px rgba(254, 97, 0, 0.20);
}

#app button[type="submit"]:hover {
  border-color: #D95200;
  background: #D95200;
}

#app div[class*="socialLinkList"] > button {
  border: 1px solid #DCE1E8;
  background: #FFFFFF;
  color: #2B2B2B;
  box-shadow: none;
}

#app div[class*="socialLinkList"] > button:hover {
  border-color: #C6CCD5;
  background: #F8F9FB;
}

#app a {
  color: #D95200;
  font-weight: 600;
}

#app button:focus-visible,
#app a:focus-visible,
#app input:focus-visible,
#app [tabindex]:focus-visible {
  outline: 3px solid rgba(254, 97, 0, 0.34);
  outline-offset: 3px;
}

#app [class*="error"],
#app [class*="Error"] {
  border-radius: 12px;
}

#app [class*="divider"] {
  color: #7C838E;
}

@media (max-width: 600px) {
  #app > div[class$="viewBox"] {
    align-items: stretch;
    padding: 0;
    background: #FFFFFF;
  }

  #app main[class*="main"] {
    width: 100%;
    min-height: 100vh;
    padding: 28px 22px max(28px, env(safe-area-inset-bottom));
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  #app main[class*="main"] img[class*="logo"] {
    max-width: 160px;
    max-height: 52px;
  }
}

@media (prefers-color-scheme: dark) {
  #app,
  #app * {
    --color-type-primary: #F7F7F8;
    --color-type-secondary: #B5BAC3;
  }

  #app > div[class$="viewBox"] {
    background: #15171A;
  }

  #app main[class*="main"] {
    border-color: #34383F;
    background: #202328;
    box-shadow: 0 24px 65px rgba(0, 0, 0, 0.30);
  }

  #app h1,
  #app h2,
  #app h3,
  #app [class*="title"] {
    color: #F7F7F8;
  }

  #app form div[class*="inputField"] > div,
  #app form div[class*="inputField"] input,
  #app form div[class*="inputField"] div[class$="countryCodeSelector"],
  #app div[class*="socialLinkList"] > button {
    border-color: #41464F;
    background: #292D33;
    color: #F7F7F8;
  }

  #app div[class*="socialLinkList"] > button:hover {
    border-color: #555C66;
    background: #32373E;
  }

  #app [class*="divider"] {
    color: #B5BAC3;
  }
}
`.trim();

type LogtoColor = Record<string, unknown>;
type LogtoBranding = Record<string, unknown>;

type LogtoSignInExperience = {
  customCss?: unknown;
  color?: unknown;
  branding?: unknown;
};

export interface LogtoBrandingSnapshot {
  customCss: string | null;
  cssSha256: string;
  color: LogtoColor | null;
  branding: LogtoBranding | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function readCustomCss(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function hashCss(value: string | null): string {
  return createHash("sha256").update(value ?? "", "utf8").digest("hex");
}

function createSnapshot(experience: LogtoSignInExperience): LogtoBrandingSnapshot {
  const customCss = readCustomCss(experience.customCss);
  return {
    customCss,
    cssSha256: hashCss(customCss),
    color: asRecord(experience.color),
    branding: asRecord(experience.branding),
  };
}

function buildCelebixBrandingPatch(experience: LogtoSignInExperience) {
  return {
    customCss: CELEBIX_LOGTO_CUSTOM_CSS,
    color: {
      ...(asRecord(experience.color) ?? {}),
      ...CELEBIX_LOGTO_BRANDING.color,
    },
    branding: {
      ...(asRecord(experience.branding) ?? {}),
      ...CELEBIX_LOGTO_BRANDING.branding,
    },
  };
}

function isCelebixBrandingActive(experience: LogtoSignInExperience): boolean {
  const color = asRecord(experience.color) ?? {};
  const branding = asRecord(experience.branding) ?? {};

  return (
    readCustomCss(experience.customCss) === CELEBIX_LOGTO_CUSTOM_CSS &&
    color.primaryColor === CELEBIX_LOGTO_BRANDING.color.primaryColor &&
    color.darkPrimaryColor === CELEBIX_LOGTO_BRANDING.color.darkPrimaryColor &&
    color.isDarkModeEnabled === CELEBIX_LOGTO_BRANDING.color.isDarkModeEnabled &&
    branding.logoUrl === CELEBIX_LOGTO_BRANDING.branding.logoUrl &&
    branding.darkLogoUrl === CELEBIX_LOGTO_BRANDING.branding.darkLogoUrl
  );
}

export async function synchronizeCelebixLogtoBranding(
  transport: LogtoManagementTransport,
): Promise<{ changed: boolean; previous: LogtoBrandingSnapshot }> {
  try {
    const experience = await transport.request<LogtoSignInExperience>(
      "/api/sign-in-exp",
    );
    const previous = createSnapshot(experience);

    if (isCelebixBrandingActive(experience)) {
      return { changed: false, previous };
    }

    await transport.request<LogtoSignInExperience>("/api/sign-in-exp", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCelebixBrandingPatch(experience)),
    });

    return { changed: true, previous };
  } catch {
    throw new Error("Logto branding synchronization failed");
  }
}

export async function restoreLogtoBranding(
  snapshot: LogtoBrandingSnapshot,
  transport: LogtoManagementTransport,
): Promise<void> {
  const patch: Record<string, unknown> = {
    customCss: snapshot.customCss,
  };

  if (snapshot.color) {
    patch.color = snapshot.color;
  }
  if (snapshot.branding) {
    patch.branding = snapshot.branding;
  }

  try {
    await transport.request("/api/sign-in-exp", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    throw new Error("Logto branding restoration failed");
  }
}
