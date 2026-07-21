import assert from "node:assert/strict";
import test from "node:test";

import { parseTrustedClientIp } from "./trusted-client-ip.ts";

test("accepts canonical public IPv4 and IPv6 selected by the authenticated proxy", () => {
  assert.equal(parseTrustedClientIp("203.0.113.19"), "203.0.113.19");
  assert.equal(parseTrustedClientIp("2001:db8::1"), "2001:db8::1");
});

test("rejects comma lists and whitespace modifications rather than choosing an attacker value", () => {
  for (const value of ["203.0.113.19, 198.51.100.2", " 203.0.113.19", "203.0.113.19 "]) assert.equal(parseTrustedClientIp(value), null);
});

test("rejects internal, loopback, unspecified, and link-local addresses", () => {
  for (const value of ["127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.0.1", "192.168.1.1", "::1", "fe80::1"]) assert.equal(parseTrustedClientIp(value), null);
});

test("rejects ports, zones, malformed values, and non-string authority", () => {
  for (const value of ["203.0.113.19:443", "[2001:db8::1]", "fe80::1%en0", "example.test", "", null]) assert.equal(parseTrustedClientIp(value), null);
});
