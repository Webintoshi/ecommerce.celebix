import { isIP } from "node:net";

const PRIVATE_V4: readonly Readonly<[number, number]>[] = Object.freeze([
  [0x00000000, 0xff000000],
  [0x0a000000, 0xff000000],
  [0x64400000, 0xffc00000],
  [0x7f000000, 0xff000000],
  [0xa9fe0000, 0xffff0000],
  [0xac100000, 0xfff00000],
  [0xc0000000, 0xffffff00],
  [0xc0000200, 0xffffff00],
  [0xc0a80000, 0xffff0000],
  [0xc0586300, 0xffffff00],
  [0xc6120000, 0xfffe0000],
  [0xc6336400, 0xffffff00],
  [0xcb007100, 0xffffff00],
  [0xe0000000, 0xf0000000],
  [0xf0000000, 0xf0000000],
]);

function ipv4Number(value: string): number {
  return value.split(".").reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
}

function ipv6Hextets(value: string): readonly number[] | null {
  try {
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    const halves = canonical.split("::");
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
    const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
    if (parts.length !== 8) return null;
    return Object.freeze(parts.map((part) => Number.parseInt(part, 16)));
  } catch {
    return null;
  }
}

function privateIpv6(value: string): boolean {
  const parts = ipv6Hextets(value);
  if (parts === null) return true;
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = parts;
  return parts.every((part) => part === 0) ||
    (parts.slice(0, 7).every((part) => part === 0) && eighth === 1) ||
    (parts.slice(0, 5).every((part) => part === 0) && sixth === 0xffff) ||
    (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x64 && second === 0xff9b && third === 1) ||
    (first === 0x100 && second === 0 && third === 0 && fourth === 0) ||
    (first === 0x2001 && second <= 0x01ff) ||
    (first === 0x2001 && second === 0x0db8) || first === 0x2002 ||
    (first & 0xfff0) === 0x3ff0 || first === 0x5f00 ||
    (first === 0x2620 && second === 0x004f && third === 0x8000) ||
    fifth === undefined || sixth === undefined || seventh === undefined || eighth === undefined;
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
