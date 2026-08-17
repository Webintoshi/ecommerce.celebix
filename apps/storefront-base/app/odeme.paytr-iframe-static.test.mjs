import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./odeme/page.tsx", import.meta.url), "utf8");

test("checkout page renders PayTR iframe responses in-place", () => {
  assert.match(source, /paytrIframeUrl/);
  assert.match(source, /result\.payment\?\.action === "iframe"/);
  assert.match(source, /setPaytrIframeUrl\(result\.payment\.iframeUrl\)/);
  assert.match(source, /<iframe[\s\S]+src=\{paytrIframeUrl\}/);
  assert.match(source, /title="PayTR güvenli ödeme"/);
});

test("checkout page uses the official PayTR iframe contract", () => {
  assert.match(source, /id="paytriframe"/);
  assert.match(source, /https:\/\/www\.paytr\.com\/js\/iframeResizer\.min\.js/);
  assert.match(source, /window\.iFrameResize\?\.\(\{\}, "#paytriframe"\)/);
});
