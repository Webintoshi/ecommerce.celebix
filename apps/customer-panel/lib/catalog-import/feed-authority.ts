import { isIP } from "node:net";

const CONTROL = /[\u0000-\u001f\u007f]/;
const ENCODED_UNRESERVED = /%(?:2[dDeE]|3[0-9]|4[1-9A-Fa-f]|5[0-9A-FaF]|6[1-9A-Fa-f]|7[0-9A-Ea-e])/;

function invalid(): never { throw new Error("catalog_feed_url_invalid"); }

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
  if (a === 192 && (b === 0 || (b === 168) || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return !(a === 255 && b === 255 && c === 255 && d === 255);
}

function ipv6Words(value: string): readonly number[] | null {
  if (isIP(value) !== 6) return null;
  const lower = value.toLowerCase();
  if (lower.includes(".")) {
    const mapped = lower.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (!mapped) return null;
    const parts = ipv4Parts(mapped[2]!);
    if (!parts) return null;
    value = `${mapped[1]}${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const halves = value.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const zeros = halves.length === 2 ? 8 - left.length - right.length : 0;
  const words = [...left, ...Array.from({ length: zeros }, () => "0"), ...right].map((word) => Number.parseInt(word, 16));
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff) ? words : null;
}

export function isPublicCatalogFeedAddress(value: string): boolean {
  if (publicIpv4(value)) return true;
  const words = ipv6Words(value);
  if (!words) return false;
  const first = words[0]!;
  if ((first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00 || (first & 0xff00) === 0xff00) return false;
  if (first === 0x2001 && words[1] === 0x0db8) return false;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return publicIpv4(`${words[6]! >> 8}.${words[6]! & 255}.${words[7]! >> 8}.${words[7]! & 255}`);
  }
  return (first & 0xe000) === 0x2000;
}

export function validateCatalogFeedUrl(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || value !== value.trim() || CONTROL.test(value) || ENCODED_UNRESERVED.test(value)) invalid();
  let url: URL;
  try { url = new URL(value); } catch { invalid(); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.href !== value || !hostname.includes(".") || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isIP(hostname) !== 0) invalid();
  return url.href;
}
