import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type UmamiPublicCollectorConfig = Readonly<{
  mode: "approved_staging";
  trackerScriptUrl: string;
  collectorOrigin: string;
}>;

type Address = Readonly<{ address: string; family: 4 | 6 }>;
type Resolver = (hostname: string) => Promise<readonly Address[]>;

function invalid(): never {
  throw new Error("umami_public_config_invalid");
}

function ipv4Parts(value: string): readonly number[] | null {
  if (isIP(value) !== 4) return null;
  const parts = value.split(".").map(Number);
  return parts.length === 4 ? parts : null;
}

function publicIpv4(value: string): boolean {
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [a, b, c, d] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return !(a === 255 && b === 255 && c === 255 && d === 255);
}

function ipv6Words(input: string): readonly number[] | null {
  if (isIP(input) !== 6) return null;
  let value = input.toLowerCase();
  if (value.includes(".")) {
    const mapped = value.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (!mapped) return null;
    const parts = ipv4Parts(mapped[2]!);
    if (!parts) return null;
    value = `${mapped[1]}${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const zeros = halves.length === 2 ? 8 - left.length - right.length : 0;
  const words = [...left, ...Array.from({ length: zeros }, () => "0"), ...right].map((word) => Number.parseInt(word, 16));
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff) ? words : null;
}

function isPublicAddress(value: string): boolean {
  if (publicIpv4(value)) return true;
  const words = ipv6Words(value);
  if (!words) return false;
  const first = words[0]!;
  if ((first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00 || (first & 0xff00) === 0xff00) return false;
  if (first === 0x2001 && words[1]! <= 0x01ff) return false;
  if (first === 0x2001 && words[1] === 0x0db8) return false;
  if (first === 0x2002 || (first & 0xfff0) === 0x3ff0) return false;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return publicIpv4(`${words[6]! >> 8}.${words[6]! & 255}.${words[7]! >> 8}.${words[7]! & 255}`);
  }
  return (first & 0xe000) === 0x2000;
}

async function defaultResolver(hostname: string): Promise<readonly Address[]> {
  const values = await dnsLookup(hostname, { all: true, verbatim: true });
  return values.filter((value): value is Address => value.family === 4 || value.family === 6);
}

function validateAddresses(value: readonly Address[]): string {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32 || value.some((entry) => !entry || !isPublicAddress(entry.address) || (entry.family !== 4 && entry.family !== 6))) invalid();
  return value.map((entry) => `${entry.family}:${entry.address.toLowerCase()}`).sort().join("\n");
}

function deniedHostname(value: string): boolean {
  return value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal") || isIP(value) !== 0 || !value.includes(".");
}

export async function parseUmamiPublicCollectorConfig(
  env: Readonly<Record<string, string | undefined>>,
  resolver: Resolver = defaultResolver,
): Promise<UmamiPublicCollectorConfig | null> {
  try {
    const fields = [env?.CELEBIX_UMAMI_PUBLIC_MODE, env?.CELEBIX_UMAMI_TRACKER_SCRIPT_URL, env?.CELEBIX_UMAMI_COLLECTOR_ORIGIN];
    if (fields.every((value) => value === undefined || value === "")) return null;
    if (env.CELEBIX_DEPLOYMENT_TIER !== "staging" || fields.some((value) => !value) || fields[0] !== "approved_staging") invalid();

    let script: URL;
    let collector: URL;
    try {
      script = new URL(fields[1]!);
      collector = new URL(fields[2]!);
    } catch {
      return invalid();
    }

    if (
      script.protocol !== "https:" || script.username || script.password || script.port || script.pathname !== "/script.js" || script.search || script.hash || script.href !== fields[1] ||
      collector.protocol !== "https:" || collector.username || collector.password || collector.port || collector.pathname !== "/" || collector.search || collector.hash || collector.origin !== fields[2] ||
      collector.hostname !== script.hostname || deniedHostname(script.hostname)
    ) invalid();

    const first = validateAddresses(await resolver(script.hostname));
    const second = validateAddresses(await resolver(script.hostname));
    if (first !== second) invalid();
    return Object.freeze({ mode: "approved_staging", trackerScriptUrl: script.href, collectorOrigin: collector.origin });
  } catch (error) {
    if (error instanceof Error && error.message === "umami_public_config_invalid") throw error;
    return invalid();
  }
}
