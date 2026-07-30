import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { parseCanonicalAdminHostname } from "@celebix/saas-data";

const MAXIMUM_LIFETIME_MS = 5 * 60_000;
const MAXIMUM_CLOCK_SKEW_MS = 30_000;
const TOKEN = /^[A-Za-z0-9_-]+$/;

function invalid(): never { throw new Error("panel_logout_state_invalid"); }

function canonicalOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048 || value !== value.trim()) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
    url.search || url.hash || url.origin !== value
  ) invalid();
  try { parseCanonicalAdminHostname(url.hostname, "production"); }
  catch {
    try { parseCanonicalAdminHostname(url.hostname, "staging"); }
    catch { return invalid(); }
  }
  return value;
}

function validNow(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

function nonce(randomBytes: (size: number) => Uint8Array): string {
  if (typeof randomBytes !== "function") invalid();
  const produced = randomBytes(18);
  if (!(produced instanceof Uint8Array) || produced.byteLength !== 18) invalid();
  return Buffer.from(produced).toString("base64url");
}

export type PanelLogoutStateCodec = Readonly<{
  issue(input: Readonly<{ destinationOrigin: string; now: Date; randomBytes(size: number): Uint8Array }>): string;
  verify(input: Readonly<{ state: string; now: Date }>): Readonly<{ destinationOrigin: string }>;
}>;

export function createPanelLogoutStateCodec(rawKey: Uint8Array): PanelLogoutStateCodec {
  if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== 32) invalid();
  const key = new Uint8Array(rawKey);
  const sign = (payload: string) => createHmac("sha256", key).update(`celebix-panel-logout-v1\n${payload}`).digest("base64url");
  const codec: PanelLogoutStateCodec = Object.freeze({
    issue(input) {
      const destinationOrigin = canonicalOrigin(input?.destinationOrigin);
      const now = validNow(input?.now);
      const payload = Buffer.from(JSON.stringify({
        v: 1,
        o: destinationOrigin,
        i: now.getTime(),
        e: now.getTime() + MAXIMUM_LIFETIME_MS,
        n: nonce(input?.randomBytes),
      })).toString("base64url");
      return `lo1.${payload}.${sign(payload)}`;
    },
    verify(input) {
      const now = validNow(input?.now);
      if (typeof input?.state !== "string" || input.state.length > 4_096 || input.state !== input.state.trim()) invalid();
      const parts = input.state.split(".");
      if (parts.length !== 3 || parts[0] !== "lo1" || !TOKEN.test(parts[1] ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(parts[2] ?? "")) invalid();
      const expected = Buffer.from(sign(parts[1] as string), "base64url");
      const actual = Buffer.from(parts[2] as string, "base64url");
      if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) invalid();
      let parsed: unknown;
      try {
        const bytes = Buffer.from(parts[1] as string, "base64url");
        if (bytes.toString("base64url") !== parts[1]) invalid();
        parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch { return invalid(); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
      const row = parsed as Record<string, unknown>;
      if (Object.keys(row).join(",") !== "v,o,i,e,n" || row.v !== 1 || !Number.isSafeInteger(row.i) || !Number.isSafeInteger(row.e) || typeof row.n !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(row.n)) invalid();
      const issuedAt = row.i as number;
      const expiresAt = row.e as number;
      if (
        expiresAt !== issuedAt + MAXIMUM_LIFETIME_MS || issuedAt > now.getTime() + MAXIMUM_CLOCK_SKEW_MS ||
        now.getTime() >= expiresAt
      ) invalid();
      return Object.freeze({ destinationOrigin: canonicalOrigin(row.o) });
    },
  });
  return codec;
}
