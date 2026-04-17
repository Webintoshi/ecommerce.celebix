import "server-only";

export interface PreparedCoolifyLiteralEnvValue {
  value: string;
  isMultiline: boolean;
}

export function prepareCoolifyLiteralEnvValue(rawValue: string): PreparedCoolifyLiteralEnvValue {
  const normalizedValue = String(rawValue ?? "").replace(/\r\n/g, "\n");

  return {
    // Coolify stores literal env values wrapped in single quotes inside the generated .env file.
    // Embedded apostrophes must be shell-escaped or deployments fail while sourcing that file.
    value: normalizedValue.replace(/'/g, "'\\''"),
    isMultiline: normalizedValue.includes("\n"),
  };
}
