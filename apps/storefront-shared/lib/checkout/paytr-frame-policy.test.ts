import assert from "node:assert/strict";
import test from "node:test";

type FrameSources = (providerOrigin: unknown, storefrontHostname: unknown) => string | null;
const policy = await import("./paytr-frame-policy.ts").catch(() => null) as null | { hostedPaymentFrameSources?: FrameSources };
function frameSources(providerOrigin: unknown, storefrontHostname: unknown): string | null {
  assert.equal(typeof policy?.hostedPaymentFrameSources, "function", "hosted frame policy must be available");
  return policy!.hostedPaymentFrameSources!(providerOrigin, storefrontHostname);
}

test("PayTR checkout permits the observed Vakifbank ACS and the exact merchant return path", () => {
  assert.equal(frameSources("https://www.paytr.com", "guzidekuyumcu.com"),
    "https://www.paytr.com https://inbound.apigateway.vakifbank.com.tr https://guzidekuyumcu.com/odeme/hizli/sonuc");
});

test("PayTR return permission follows the trusted store hostname", () => {
  assert.equal(frameSources("https://www.paytr.com", "alpler-spor.saas-staging.celebix.net"),
    "https://www.paytr.com https://inbound.apigateway.vakifbank.com.tr https://alpler-spor.saas-staging.celebix.net/odeme/hizli/sonuc");
});

test("other supported hosted providers do not receive PayTR bank or merchant return permissions", () => {
  for (const origin of ["https://sandbox-cpp.iyzipay.com", "https://cpp.iyzipay.com"]) {
    assert.equal(frameSources(origin, "guzidekuyumcu.com"), origin);
  }
});

test("unknown and noncanonical provider origins fail closed", () => {
  for (const origin of [
    "https://inbound.apigateway.vakifbank.com.tr", "https://attacker.example",
    "https://www.paytr.com.attacker.example", "https://paytr.com", "http://www.paytr.com",
    "https://www.paytr.com:443", "https://www.paytr.com:8443", "https://www.paytr.com/",
    "https://www.paytr.com/path", "https://www.paytr.com?x=1", "https://www.paytr.com#x",
    "https://user:pass@www.paytr.com", "https://WWW.PAYTR.COM", " https://www.paytr.com",
    "https://www.paytr.com\nhttps://attacker.example", null, undefined, 1, {},
  ]) assert.equal(frameSources(origin, "guzidekuyumcu.com"), null, String(origin));
});

test("unsafe merchant hostnames cannot inject or broaden the frame policy", () => {
  for (const hostname of [
    "", "localhost", "127.0.0.1", "guzidekuyumcu.com:443", "guzidekuyumcu.com:8443",
    "https://guzidekuyumcu.com", "user@guzidekuyumcu.com", "guzidekuyumcu.com/path",
    "guzidekuyumcu.com?x=1", "guzidekuyumcu.com#x", "guzidekuyumcu.com.",
    "Guzidekuyumcu.com", " guzidekuyumcu.com", "guzidekuyumcu.com ",
    "guzidekuyumcu.com; frame-src https:", "guzidekuyumcu.com\nhttps://attacker.example",
    "*.guzidekuyumcu.com", "-guzide.com", "guzide-.com", "guzide..com",
    `${"a".repeat(64)}.com`, null, undefined, 1, {},
  ]) assert.equal(frameSources("https://www.paytr.com", hostname), null, String(hostname));
});
