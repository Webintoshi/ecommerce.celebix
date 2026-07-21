import assert from "node:assert/strict";
import test from "node:test";

import { parseTrustedClientIp } from "./trusted-client-ip.ts";

test("accepts canonical public IPv4 and IPv6 selected by the authenticated proxy", () => {
  assert.equal(parseTrustedClientIp("8.8.8.8"), "8.8.8.8");
  assert.equal(parseTrustedClientIp("2606:4700:4700::1111"), "2606:4700:4700::1111");
});

test("rejects comma lists and whitespace modifications rather than choosing an attacker value", () => {
  for (const value of ["203.0.113.19, 198.51.100.2", " 203.0.113.19", "203.0.113.19 "]) assert.equal(parseTrustedClientIp(value), null);
});

test("rejects internal, loopback, unspecified, documentation, benchmark, multicast, and reserved addresses", () => {
  for (const value of [
    "127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.0.1", "192.168.1.1", "192.0.2.1",
    "192.88.99.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
    "::1", "fe80::1", "fec0::1", "64:ff9b:1::1", "100::1", "2001:10::1", "2001:db8::1",
    "2002::1", "3fff::1", "5f00::1", "ff02::1", "::ffff:10.0.0.1",
    "0:0:0:0:0:ffff:127.0.0.1", "::ffff:192.168.1.1",
  ]) assert.equal(parseTrustedClientIp(value), null, value);
});

test("rejects ports, zones, malformed values, and non-string authority", () => {
  for (const value of ["8.8.8.8:443", "[2606:4700:4700::1111]", "fe80::1%en0", "example.test", "", null, "192.0.2.1", "198.51.100.1", "203.0.113.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "2001:db8::1", "ff02::1"]) assert.equal(parseTrustedClientIp(value), null);
});
