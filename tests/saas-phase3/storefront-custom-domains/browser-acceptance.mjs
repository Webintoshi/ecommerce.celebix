import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ARTIFACTS = path.join(ROOT, ".codex-artifacts/storefront-custom-domains");
const CHROME = [process.env.CHROME_BIN, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((candidate) => candidate && existsSync(candidate));

function config() {
  if (process.env.CELEBIX_CUSTOM_DOMAIN_BROWSER_RUN !== "approved" || process.env.CELEBIX_DEPLOYMENT_TIER !== "staging") throw new Error("custom_domain_browser_configuration_missing");
  const selected = {};
  for (const [key, suffix] of [
    ["panelOrigin", ["CELEBIX_CUSTOM_DOMAIN_STAGING_PANEL_ORIGIN", ".admin.saas-staging.celebix.site"]],
    ["platformOrigin", ["CELEBIX_CUSTOM_DOMAIN_STAGING_PLATFORM_ORIGIN", ".saas-staging.celebix.site"]],
    ["customOrigin", ["CELEBIX_CUSTOM_DOMAIN_STAGING_CUSTOM_ORIGIN", ".celebix.co"]],
  ]) {
    const raw = process.env[suffix[0]];
    const url = new URL(raw ?? "invalid://missing");
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !url.hostname.endsWith(suffix[1])) throw new Error("custom_domain_browser_configuration_invalid");
    selected[key] = url.origin;
  }
  const cookie = process.env.CELEBIX_CUSTOM_DOMAIN_STAGING_PANEL_COOKIE;
  if (!/^__Host-celebix_panel=v1[.][a-z][a-z0-9_-]{2,31}[.][A-Za-z0-9_-]{43}$/u.test(cookie ?? "")) throw new Error("custom_domain_browser_configuration_invalid");
  selected.cookie = cookie;
  return Object.freeze(selected);
}

function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close((error) => error ? reject(error) : resolve(address.port)); }); }); }
async function waitForHttp(url) { const deadline = Date.now() + 20_000; while (Date.now() < deadline) { try { const response = await fetch(url); if (response.ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("custom_domain_browser_start_timeout"); }

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", ({ data }) => { const message = JSON.parse(String(data)); if (!message.id) return; const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error("custom_domain_browser_protocol_error")) : pending.resolve(message.result ?? {}); });
  }
  async send(method, params = {}) { await this.ready; const id = ++this.id; const pending = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return pending; }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error("custom_domain_browser_evaluation_failed"); return result.result?.value; }
  close() { this.socket.close(); }
}

async function waitFor(cdp, expression, label) { const deadline = Date.now() + 20_000; while (Date.now() < deadline) { if (await cdp.evaluate(`Boolean(${expression})`)) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`custom_domain_browser_wait_${label}`); }
async function navigate(cdp, url) { const result = await cdp.send("Page.navigate", { url }); if (result.errorText && result.errorText !== "net::ERR_ABORTED") throw new Error("custom_domain_browser_navigation_failed"); await waitFor(cdp, `document.readyState==='complete'&&location.href.startsWith(${JSON.stringify(url.split("?", 1)[0])})`, "navigation"); }
async function viewport(cdp, width, height) { await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile: width <= 600 }); await waitFor(cdp, `innerWidth===${width}`, "viewport"); }
async function screenshot(cdp, name) { const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }); const target = path.join(ARTIFACTS, name); writeFileSync(target, Buffer.from(data, "base64")); return path.relative(ROOT, target); }

async function main() {
  const authority = config();
  assert.ok(CHROME, "chrome_binary_required");
  rmSync(ARTIFACTS, { recursive: true, force: true }); mkdirSync(ARTIFACTS, { recursive: true });
  const profile = mkdtempSync(path.join(tmpdir(), "celebix-custom-domain-browser-"));
  const port = await freePort();
  const chrome = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--disable-extensions", "--disable-background-networking", "--no-first-run", "about:blank"], { stdio: "ignore" });
  let cdp;
  try {
    await waitForHttp(`http://127.0.0.1:${port}/json/version`);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find((entry) => entry.type === "page"); assert.ok(page?.webSocketDebuggerUrl);
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    const [cookieName, cookieValue] = authority.cookie.split("=", 2);
    await cdp.send("Network.setCookie", { name: cookieName, value: cookieValue, domain: new URL(authority.panelOrigin).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" });

    const evidence = [];
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
      await viewport(cdp, width, height);
      await navigate(cdp, `${authority.panelOrigin}/settings/domains`);
      await waitFor(cdp, "document.body.innerText.includes('Alan Adı')&&document.querySelector('input')", `panel_${label}`);
      const panel = await cdp.evaluate(`(() => ({overflow:document.documentElement.scrollWidth-innerWidth,inputs:document.querySelectorAll('input').length,buttons:[...document.querySelectorAll('button')].filter((node)=>node.getClientRects().length).map((node)=>node.textContent.trim()).filter(Boolean),text:document.body.innerText.slice(0,2000)}))()`);
      assert.ok(panel.overflow <= 0, `${label}_horizontal_overflow`);
      assert.ok(panel.inputs >= 1, `${label}_domain_input`);
      assert.match(panel.text, /Aktif|DNS|SSL|Hazırlanıyor|İşlem gerekiyor/u);
      evidence.push({ label, screenshot: await screenshot(cdp, `domains-${label}.png`), buttons: panel.buttons.length });
    }

    await viewport(cdp, 390, 844);
    for (const pathname of ["/account/login?returnTo=%2Fcheckout", "/cart", "/checkout"]) {
      await navigate(cdp, `${authority.customOrigin}${pathname}`);
      const pageState = await cdp.evaluate("({overflow:document.documentElement.scrollWidth-innerWidth,title:document.title,text:document.body.innerText.slice(0,600)})");
      assert.ok(pageState.overflow <= 0, pathname);
      assert.ok(pageState.text.length > 20, pathname);
    }

    const alias = await fetch(new URL("/products?browser=acceptance", authority.platformOrigin), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get("location"), `${authority.customOrigin}/products?browser=acceptance`);
    const result = Object.freeze({ viewportCount: 2, evidence, customAccountCartCheckout: true, aliasRedirect: true, sensitiveValuesPersisted: false });
    writeFileSync(path.join(ARTIFACTS, "browser-acceptance.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write("PASS storefront custom-domain browser acceptance\n");
  } finally {
    cdp?.close();
    if (chrome.exitCode === null) chrome.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => chrome.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

await main();
