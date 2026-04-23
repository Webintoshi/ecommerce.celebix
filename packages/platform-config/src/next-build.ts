import os from "node:os";

function resolveAvailableCpuCount(): number {
  if (typeof os.availableParallelism === "function") {
    return Math.max(1, os.availableParallelism());
  }

  return Math.max(1, os.cpus()?.length || 1);
}

function parseCpuValue(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue?.trim() || "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function resolveCpuOverride(envNames: string[]): string | undefined {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

export function resolveNextBuildCpuCap(defaultCap: number, envNames: string[] = []): number {
  const availableCpuCount = resolveAvailableCpuCount();
  const configuredCpuCap = parseCpuValue(
    resolveCpuOverride([...envNames, "CELEBIX_NEXT_BUILD_CPUS", "NEXT_BUILD_CPUS"]),
    defaultCap,
  );

  return Math.max(1, Math.min(configuredCpuCap, availableCpuCount));
}

export function resolveProvisionedNextBuildCpuCap(
  defaultCap: number,
  envNames: string[] = [],
): string {
  return String(
    resolveNextBuildCpuCap(
      parseCpuValue(
        resolveCpuOverride([...envNames, "CELEBIX_BUILD_CPUS", "CELEBIX_NEXT_BUILD_CPUS"]),
        defaultCap,
      ),
    ),
  );
}
