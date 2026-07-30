import type { LogtoManagementTransport } from "./logto-management-transport";

export interface LogtoAdminIdentity {
  subject: string;
  email: string;
  fullName: string | null;
  created: boolean;
}

type LogtoUserRecord = Record<string, unknown>;

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Gecerli bir e-posta adresi gerekli.");
  }
  return normalized;
}

function readString(record: LogtoUserRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUsers(payload: unknown): LogtoUserRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (entry): entry is LogtoUserRecord =>
        Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as LogtoUserRecord;
  for (const key of ["data", "items", "users", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return normalizeUsers(value);
    }
  }

  return [];
}

function readCreatedUser(payload: unknown): LogtoUserRecord | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as LogtoUserRecord;
  const nested = record.data;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as LogtoUserRecord)
    : record;
}

function toIdentity(
  user: LogtoUserRecord,
  fallbackEmail: string,
  fallbackName: string | null,
  created: boolean,
): LogtoAdminIdentity {
  const subject = readString(user, "id");
  if (!subject) {
    throw new Error("Logto admin identity response is missing an id");
  }

  return {
    subject,
    email: readString(user, "primaryEmail")?.toLowerCase() ?? fallbackEmail,
    fullName: readString(user, "name") ?? fallbackName,
    created,
  };
}

export async function findOrCreateLogtoAdminIdentity(
  input: {
    email: string;
    fullName?: string;
    password?: string;
  },
  transport: LogtoManagementTransport,
): Promise<LogtoAdminIdentity> {
  const email = normalizeEmail(input.email);
  const fullName = input.fullName?.trim() || null;
  const search = new URLSearchParams({
    "search.primaryEmail": email,
    "mode.primaryEmail": "exact",
    page: "1",
    page_size: "2",
  });

  let searchPayload: unknown;
  try {
    searchPayload = await transport.request(`/api/users?${search.toString()}`);
  } catch {
    throw new Error("Logto admin identity lookup failed");
  }

  const exactMatches = normalizeUsers(searchPayload).filter(
    (user) => readString(user, "primaryEmail")?.toLowerCase() === email,
  );

  if (exactMatches.length > 1) {
    throw new Error("Bu e-posta icin birden fazla Logto kimligi bulundu.");
  }

  if (exactMatches[0]) {
    return toIdentity(exactMatches[0], email, fullName, false);
  }

  const password = input.password?.trim() ?? "";
  if (password.length < 8) {
    throw new Error("Yeni Logto hesabi icin gecici sifre en az 8 karakter olmalidir.");
  }

  let createdPayload: unknown;
  try {
    createdPayload = await transport.request("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryEmail: email,
        name: fullName ?? email,
        password,
      }),
    });
  } catch {
    throw new Error("Logto admin identity creation failed");
  }

  const createdUser = readCreatedUser(createdPayload);
  if (!createdUser) {
    throw new Error("Logto admin identity creation failed");
  }

  return toIdentity(createdUser, email, fullName, true);
}
