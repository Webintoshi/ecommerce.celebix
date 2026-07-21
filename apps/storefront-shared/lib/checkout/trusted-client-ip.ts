import { isIP } from "node:net";

const PRIVATE_V4: readonly Readonly<[number, number]>[] = Object.freeze([
  [0x00000000, 0xff000000],
  [0x0a000000, 0xff000000],
  [0x7f000000, 0xff000000],
  [0xa9fe0000, 0xffff0000],
  [0xac100000, 0xfff00000],
  [0xc0a80000, 0xffff0000],
]);

function ipv4Number(value: string): number {
  return value.split(".").reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
}

function privateIpv6(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") ||
    /^fe[89ab]/.test(lower) || lower.startsWith("::ffff:10.") || lower.startsWith("::ffff:127.") ||
    lower.startsWith("::ffff:192.168.");
}

export function parseTrustedClientIp(value: unknown): string | null {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 64 ||
      /[,\s%\[\]]/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const version = isIP(value);
  if (version === 4) {
    const number = ipv4Number(value);
    return PRIVATE_V4.some(([network, mask]) => (number & mask) === (network & mask)) ? null : value;
  }
  if (version === 6) return privateIpv6(value) ? null : value.toLowerCase();
  return null;
}
