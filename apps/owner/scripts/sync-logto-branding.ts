import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

import {
  CELEBIX_LOGTO_BRANDING,
  CELEBIX_LOGTO_CUSTOM_CSS,
  synchronizeCelebixLogtoBranding,
} from "../lib/logto-branding.ts";

const ROLLBACK_PATH = "/tmp/celebix-logto-branding-rollback.json";
const APPLICATION_ROLLBACK_PATH =
  "/tmp/celebix-logto-application-branding-rollback.json";
const ORGANIZATION_ROLLBACK_PATH =
  "/tmp/celebix-logto-organization-branding-rollback.json";

function readEnv(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    const normalized = value?.toLowerCase();

    if (
      value &&
      normalized &&
      !normalized.startsWith("configure-") &&
      !normalized.startsWith("placeholder-")
    ) {
      return value;
    }
  }

  return null;
}

function getManagementApiBaseUrl(): string {
  const raw = readEnv(["LOGTO_MANAGEMENT_API_URL", "LOGTO_API_URL"]);

  if (!raw) {
    throw new Error("LOGTO_MANAGEMENT_API_URL_MISSING");
  }

  const baseUrl = raw.replace(/\/+$/, "");
  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

async function getManagementToken(apiBaseUrl: string): Promise<string> {
  const clientId = readEnv([
    "LOGTO_MANAGEMENT_M2M_CLIENT_ID",
    "LOGTO_M2M_CLIENT_ID",
    "LOGTO_MANAGEMENT_APP_ID",
  ]);
  const clientSecret = readEnv([
    "LOGTO_MANAGEMENT_M2M_CLIENT_SECRET",
    "LOGTO_M2M_CLIENT_SECRET",
    "LOGTO_MANAGEMENT_APP_SECRET",
  ]);

  if (clientId && clientSecret) {
    const resource =
      readEnv(["LOGTO_MANAGEMENT_RESOURCE"]) || "https://default.logto.app/api";
    const response = await fetch(
      `${apiBaseUrl.replace(/\/api$/, "")}/oidc/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          resource,
          scope: "all",
        }).toString(),
      },
    );

    if (!response.ok) {
      throw new Error(`LOGTO_MANAGEMENT_TOKEN_MINT_FAILED_HTTP_${response.status}`);
    }

    const payload = (await response.json()) as { access_token?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) {
      throw new Error("LOGTO_MANAGEMENT_TOKEN_MISSING");
    }

    return payload.access_token;
  }

  const staticToken = readEnv([
    "LOGTO_MANAGEMENT_API_TOKEN",
    "LOGTO_M2M_TOKEN",
    "LOGTO_MANAGEMENT_TOKEN",
  ]);

  if (!staticToken) {
    throw new Error("LOGTO_MANAGEMENT_AUTHORITY_MISSING");
  }

  return staticToken;
}

function normalizeList(value: unknown): Array<Record<string, unknown>> {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];

  return candidates.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function hasValues(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(
    record &&
      Object.values(record).some((entry) =>
        typeof entry === "string" ? entry.length > 0 : Boolean(entry),
      ),
  );
}

function hashCss(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : "", "utf8")
    .digest("hex");
}

function createCelebixExperiencePatch(experience: Record<string, unknown>) {
  return {
    color: {
      ...(asRecord(experience.color) ?? {}),
      ...CELEBIX_LOGTO_BRANDING.color,
    },
    branding: {
      ...(asRecord(experience.branding) ?? {}),
      ...CELEBIX_LOGTO_BRANDING.branding,
    },
    customCss: CELEBIX_LOGTO_CUSTOM_CSS,
  };
}

function isCelebixExperienceActive(experience: Record<string, unknown>): boolean {
  const color = asRecord(experience.color);
  const branding = asRecord(experience.branding);

  return (
    hashCss(experience.customCss) === hashCss(CELEBIX_LOGTO_CUSTOM_CSS) &&
    color?.primaryColor === CELEBIX_LOGTO_BRANDING.color.primaryColor &&
    color?.darkPrimaryColor === CELEBIX_LOGTO_BRANDING.color.darkPrimaryColor &&
    color?.isDarkModeEnabled === CELEBIX_LOGTO_BRANDING.color.isDarkModeEnabled &&
    branding?.logoUrl === CELEBIX_LOGTO_BRANDING.branding.logoUrl &&
    branding?.darkLogoUrl === CELEBIX_LOGTO_BRANDING.branding.darkLogoUrl
  );
}

async function run(): Promise<void> {
  const apiBaseUrl = getManagementApiBaseUrl();
  const token = await getManagementToken(apiBaseUrl);
  const request = async <T>(pathname: string, init: RequestInit = {}): Promise<T> => {
    const normalized = pathname.replace(/^\/api(?=\/|$)/, "");
    const response = await fetch(
      `${apiBaseUrl}${normalized.startsWith("/") ? normalized : `/${normalized}`}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `LOGTO_MANAGEMENT_API_${init.method ?? "GET"}_HTTP_${response.status}`,
      );
    }

    return (response.status === 204 ? null : await response.json()) as T;
  };
  const before = await request<Record<string, unknown>>("/api/sign-in-exp");
  const previous = {
    customCss: typeof before.customCss === "string" ? before.customCss : null,
    cssSha256: hashCss(before.customCss),
    color: asRecord(before.color),
    branding: asRecord(before.branding),
  };

  if (!existsSync(ROLLBACK_PATH)) {
    writeFileSync(ROLLBACK_PATH, JSON.stringify(previous), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  const applications = normalizeList(
    await request("/api/applications?page=1&page_size=100"),
  );
  let applicationOverrides = 0;
  let applicationOverridesChanged = 0;
  const applicationSnapshots: Array<{
    applicationId: string;
    experience: Record<string, unknown>;
  }> = [];

  for (const application of applications) {
    if (typeof application.id !== "string") {
      continue;
    }

    try {
      const experience = await request<Record<string, unknown>>(
        `/api/applications/${encodeURIComponent(application.id)}/sign-in-experience`,
      );
      if (
        (typeof experience.customCss === "string" && experience.customCss.length > 0) ||
        hasValues(experience.branding) ||
        hasValues(experience.color)
      ) {
        applicationOverrides += 1;
        applicationSnapshots.push({
          applicationId: application.id,
          experience,
        });
      }
    } catch {
      // Most first-party apps do not have an application-level experience.
    }
  }

  if (applicationSnapshots.length > 0 && !existsSync(APPLICATION_ROLLBACK_PATH)) {
    writeFileSync(
      APPLICATION_ROLLBACK_PATH,
      JSON.stringify(applicationSnapshots),
      { encoding: "utf8", mode: 0o600 },
    );
  }

  for (const snapshot of applicationSnapshots) {
    if (!isCelebixExperienceActive(snapshot.experience)) {
      const existing = snapshot.experience;
      await request(
        `/api/applications/${encodeURIComponent(snapshot.applicationId)}/sign-in-experience`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...createCelebixExperiencePatch(existing),
            displayName:
              typeof existing.displayName === "string" ? existing.displayName : null,
            termsOfUseUrl:
              typeof existing.termsOfUseUrl === "string"
                ? existing.termsOfUseUrl
                : null,
            privacyPolicyUrl:
              typeof existing.privacyPolicyUrl === "string"
                ? existing.privacyPolicyUrl
                : null,
          }),
        },
      );
      applicationOverridesChanged += 1;
    }

    const verified = await request<Record<string, unknown>>(
      `/api/applications/${encodeURIComponent(snapshot.applicationId)}/sign-in-experience`,
    );
    if (!isCelebixExperienceActive(verified)) {
      throw new Error("CELEBIX_LOGTO_APPLICATION_BRANDING_VERIFICATION_FAILED");
    }
  }

  const organizations = normalizeList(
    await request("/api/organizations?page=1&page_size=100"),
  );
  const organizationSnapshots = organizations.filter(
    (organization) =>
      (typeof organization.customCss === "string" &&
        organization.customCss.length > 0) ||
      hasValues(organization.branding) ||
      hasValues(organization.color),
  );
  const organizationOverrides = organizationSnapshots.length;
  let organizationOverridesChanged = 0;

  if (organizationSnapshots.length > 0 && !existsSync(ORGANIZATION_ROLLBACK_PATH)) {
    writeFileSync(
      ORGANIZATION_ROLLBACK_PATH,
      JSON.stringify(organizationSnapshots),
      { encoding: "utf8", mode: 0o600 },
    );
  }

  for (const organization of organizationSnapshots) {
    if (typeof organization.id !== "string") {
      continue;
    }

    if (!isCelebixExperienceActive(organization)) {
      await request(
        `/api/organizations/${encodeURIComponent(organization.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(createCelebixExperiencePatch(organization)),
        },
      );
      organizationOverridesChanged += 1;
    }

    const verified = await request<Record<string, unknown>>(
      `/api/organizations/${encodeURIComponent(organization.id)}`,
    );
    if (!isCelebixExperienceActive(verified)) {
      throw new Error("CELEBIX_LOGTO_ORGANIZATION_BRANDING_VERIFICATION_FAILED");
    }
  }

  const result = await synchronizeCelebixLogtoBranding({ request });
  const after = await request<Record<string, unknown>>("/api/sign-in-exp");
  const activeCssSha256 = hashCss(after.customCss);
  const targetCssSha256 = hashCss(CELEBIX_LOGTO_CUSTOM_CSS);
  const color = asRecord(after.color);
  const branding = asRecord(after.branding);
  const valid =
    activeCssSha256 === targetCssSha256 &&
    color?.primaryColor === CELEBIX_LOGTO_BRANDING.color.primaryColor &&
    color?.darkPrimaryColor === CELEBIX_LOGTO_BRANDING.color.darkPrimaryColor &&
    color?.isDarkModeEnabled === CELEBIX_LOGTO_BRANDING.color.isDarkModeEnabled &&
    branding?.logoUrl === CELEBIX_LOGTO_BRANDING.branding.logoUrl &&
    branding?.darkLogoUrl === CELEBIX_LOGTO_BRANDING.branding.darkLogoUrl;

  if (!valid) {
    throw new Error("CELEBIX_LOGTO_BRANDING_VERIFICATION_FAILED");
  }

  console.log(
    JSON.stringify({
      priorCssSha256: previous.cssSha256,
      activeCssSha256,
      targetCssSha256,
      changed: result.changed,
      rollbackPath: ROLLBACK_PATH,
      applicationsScanned: applications.length,
      applicationOverrides,
      applicationOverridesChanged,
      organizationsScanned: organizations.length,
      organizationOverrides,
      organizationOverridesChanged,
    }),
  );
}

run().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
});
