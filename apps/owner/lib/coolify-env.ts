import "server-only";

export interface PreparedCoolifyEnvValue {
  value: string;
  isMultiline: boolean;
  isLiteral: boolean;
}

export function prepareCoolifyEnvValue(rawValue: string): PreparedCoolifyEnvValue {
  const normalizedValue = String(rawValue ?? "").replace(/\r\n/g, "\n");

  return {
    value: normalizedValue,
    isMultiline: normalizedValue.includes("\n"),
    // Coolify writes literal env values wrapped in single quotes inside its generated .env file.
    // Values that already contain apostrophes break that output, so those must stay non-literal.
    isLiteral: !normalizedValue.includes("\n") && !normalizedValue.includes("'"),
  };
}
