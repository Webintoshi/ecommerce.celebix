import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const COMPONENT = new URL("./ArtificialIntelligenceSettings.tsx", import.meta.url);
const PAGE = new URL("../../app/settings/artificial-intelligence/page.tsx", import.meta.url);
const CSS = new URL("./artificial-intelligence-settings.module.css", import.meta.url);

test("AI settings page uses the dedicated provider surface and removes old warning copy", async () => {
  const page = await readFile(PAGE, "utf8");
  assert.match(page, /ArtificialIntelligenceSettings/);
  assert.doesNotMatch(page, /MerchantModuleConsole|ai_setting|İlk yapılandırma|İşlem geçmişi/);
  assert.doesNotMatch(page, /Sağlayıcı etkinleştirilmeden içerik üretilmez/);
});

test("provider UI renders all brands and secure connection controls without a repeated page title", async () => {
  const source = await readFile(COMPONENT, "utf8");
  for (const label of ["OpenAI", "Google Gemini", "Anthropic Claude"]) assert.match(source, new RegExp(label));
  assert.match(source, /type="password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /setDefault/);
  assert.match(source, /selectModel/);
  assert.match(source, /revoke/);
  assert.match(source, /window[.]confirm/);
  assert.match(source, /submissionActive[.]current/);
  assert.match(source, /setKeys\(.*""/s);
  assert.doesNotMatch(source, /<h1/);
  assert.doesNotMatch(source, /apiKey.*localStorage|localStorage.*apiKey/s);
});

test("provider styling stays flat responsive and does not reintroduce generic cards", async () => {
  const css = await readFile(CSS, "utf8");
  assert.match(css, /border-bottom/);
  assert.match(css, /@media/);
  assert.doesNotMatch(css, /box-shadow/);
  assert.doesNotMatch(css, /\.card\b/);
});
