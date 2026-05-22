import type { LogtoNextConfig } from "@logto/next";
import { UserScope } from "@logto/next";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { getLogtoAdminAuthMode, LOGTO_ADMIN_CALLBACK_PATH } from "@/lib/logto-admin-auth";

const MIN_COOKIE_SECRET_LENGTH = 32;

type LogtoConfigStatus = {
  enabled: boolean;
  configured: boolean;
  callbackUrl: string;
  missingEnv: string[];
};

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return null;
  }

  return value.trim();
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export function getLogtoAdminConfigStatus(): LogtoConfigStatus {
  const authMode = getLogtoAdminAuthMode();
  const endpoint = readEnv("LOGTO_ENDPOINT");
  const appId = readEnv("LOGTO_ADMIN_APP_ID");
  const appSecret = readEnv("LOGTO_ADMIN_APP_SECRET");
  const cookieSecret = readEnv("LOGTO_COOKIE_SECRET");

  const missingEnv = [
    !endpoint ? "LOGTO_ENDPOINT" : null,
    !appId ? "LOGTO_ADMIN_APP_ID" : null,
    !appSecret ? "LOGTO_ADMIN_APP_SECRET" : null,
    !cookieSecret || cookieSecret.length < MIN_COOKIE_SECRET_LENGTH ? "LOGTO_COOKIE_SECRET" : null,
  ].filter((entry): entry is string => Boolean(entry));

  const baseUrl = normalizeBaseUrl(STORE_RUNTIME.adminUrl);

  return {
    enabled: authMode.enabled,
    configured: missingEnv.length === 0,
    callbackUrl: `${baseUrl}${LOGTO_ADMIN_CALLBACK_PATH}`,
    missingEnv,
  };
}

export function getLogtoAdminConfig(): LogtoNextConfig | null {
  const status = getLogtoAdminConfigStatus();
  if (!status.configured) {
    return null;
  }

  const endpoint = readEnv("LOGTO_ENDPOINT");
  const appId = readEnv("LOGTO_ADMIN_APP_ID");
  const appSecret = readEnv("LOGTO_ADMIN_APP_SECRET");
  const cookieSecret = readEnv("LOGTO_COOKIE_SECRET");

  if (!endpoint || !appId || !appSecret || !cookieSecret) {
    return null;
  }

  return {
    endpoint,
    appId,
    appSecret,
    baseUrl: normalizeBaseUrl(STORE_RUNTIME.adminUrl),
    cookieSecret,
    cookieSecure: process.env.NODE_ENV === "production",
    scopes: [UserScope.Email, UserScope.Organizations],
  };
}
