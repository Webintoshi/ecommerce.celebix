import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ARTIFACTS = path.join(ROOT, ".codex-artifacts/starter-commerce");
const VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900, "desktop-1440x900"]),
  Object.freeze([1025, 768, "desktop-1025x768"]),
  Object.freeze([1024, 768, "mobile-1024x768"]),
  Object.freeze([390, 844, "mobile-390x844"]),
  Object.freeze([320, 720, "mobile-320x720"]),
]);
const CHROME = [process.env.CHROME_BIN, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((candidate) => candidate && existsSync(candidate));
const BASE = (() => {
  const raw = process.env.STOREFRONT_BASE_URL;
  if (!raw) throw new Error("STOREFRONT_BASE_URL_required");
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("STOREFRONT_BASE_URL_must_be_loopback_http_origin");
  return url.origin;
})();

function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close((error) => error ? reject(error) : resolve(typeof address === "object" && address ? address.port : 0)); }); }); }
async function waitForHttp(url, timeout = 30_000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { try { const response = await fetch(url); if (response.ok) return response; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`http_timeout:${url}`); }

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("cdp_open_timeout")), 10_000); this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true }); this.socket.addEventListener("error", () => reject(new Error("cdp_open_failed")), { once: true }); });
    this.socket.addEventListener("message", ({ data }) => { const message = JSON.parse(String(data)); if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result ?? {}); return; } for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {}); });
  }
  on(method, listener) { const listeners = this.listeners.get(method) ?? new Set(); listeners.add(listener); this.listeners.set(method, listeners); return () => listeners.delete(listener); }
  async send(method, params = {}) { await this.ready; const id = ++this.id; const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return result; }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(`browser_evaluation_failed:${result.exceptionDetails.text}`); return result.result?.value; }
  close() { this.socket.close(); }
}

async function waitFor(cdp, expression, label, timeout = 20_000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (await cdp.evaluate(`Boolean(${expression})`)) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`browser_wait_timeout:${label}`); }
async function viewport(cdp, width, height) { await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile: width <= 1024 }); await waitFor(cdp, `innerWidth===${width}&&innerHeight===${height}`, `${width}x${height}`); }
async function navigate(cdp, route) {
  const navigation = await cdp.send("Page.navigate", { url: `${BASE}${route}` });
  // Chromium can report ERR_ABORTED when Next.js replaces an in-flight document
  // navigation with the same canonical URL. The settled location below remains
  // the authority; every other network error still fails immediately.
  if (navigation.errorText && navigation.errorText !== "net::ERR_ABORTED") throw new Error(`browser_navigation_failed:${route}:${navigation.errorText}`);
  try {
    await waitFor(cdp, `document.readyState==='complete'&&location.pathname===${JSON.stringify(route.split("?", 1)[0])}`, route);
  } catch (error) {
    const state = await cdp.evaluate("({href:location.href,pathname:location.pathname,readyState:document.readyState,title:document.title,text:document.body?.innerText?.slice(0,160)})");
    throw new Error(`${error.message}:${JSON.stringify(state)}`);
  }
}
async function click(cdp, expression, label) { const clicked = await cdp.evaluate(`(() => { const node=${expression}; if(!node||!node.getClientRects().length)return false; node.click(); return true; })()`); assert.equal(clicked, true, label); }
async function fill(cdp, selector, value) {
  await waitFor(cdp, `document.querySelector(${JSON.stringify(selector)}) instanceof HTMLInputElement||document.querySelector(${JSON.stringify(selector)}) instanceof HTMLTextAreaElement`, `fill:${selector}`);
  const focused = await cdp.evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement))return false; node.focus(); node.select(); return document.activeElement===node; })()`);
  assert.equal(focused, true, selector);
  await cdp.send("Input.insertText", { text: value });
  try {
    await waitFor(cdp, `document.querySelector(${JSON.stringify(selector)})?.value===${JSON.stringify(value)}`, `filled:${selector}`);
  } catch (error) {
    const state = await cdp.evaluate(`({value:document.querySelector(${JSON.stringify(selector)})?.value,path:location.pathname,text:document.body.innerText.slice(0,500),legend:document.querySelector('.checkout-form legend')?.textContent,fields:[...document.querySelectorAll('.checkout-fields input')].map((node)=>({name:node.name,value:node.value}))})`);
    throw new Error(`${error.message}:${JSON.stringify(state)}`);
  }
}
async function screenshot(cdp, name) { const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const target = path.join(ARTIFACTS, name); writeFileSync(target, Buffer.from(data, "base64")); return target; }

async function measure(cdp, label) {
  const result = await cdp.evaluate(`(() => {
    const visible=(node)=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return node.getClientRects().length>0&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0};
    const controls=[...document.querySelectorAll('.store-utilities a,.mobile-menu summary,.store-button,button:not([disabled]),input:not([disabled]),textarea:not([disabled])')].filter(visible).map((node)=>{const hit=node.matches('input[type=radio],input[type=checkbox]')?node.closest('label')??node:node;const rect=hit.getBoundingClientRect();return {width:rect.width,height:rect.height,tag:node.tagName,className:node.className,type:node.getAttribute('type')}});
    const rgb=(value)=>value.match(/[\\d.]+/g)?.slice(0,3).map(Number)??[0,0,0];
    const lum=(value)=>rgb(value).map((part)=>part/255).map((part)=>part<=.03928?part/12.92:Math.pow((part+.055)/1.055,2.4)).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0);
    const primary=[...document.querySelectorAll('.store-button:not(:disabled)')].filter(visible).map((node)=>{const style=getComputedStyle(node),a=lum(style.color),b=lum(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
    const positiveTabindex=[...document.querySelectorAll('[tabindex]')].filter((node)=>Number(node.getAttribute('tabindex'))>0).length;
    return {label:${JSON.stringify(label)},horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),minimumTarget:controls.length?Math.min(...controls.map(({width,height})=>Math.min(width,height))):0,undersized:controls.filter(({width,height})=>Math.min(width,height)<48),primaryContrast:primary.length?Math.min(...primary):null,positiveTabindex};
  })()`);
  assert.equal(result.horizontalOverflow, 0, `${label}:horizontal_overflow`);
  assert.ok(result.minimumTarget >= 48, `${label}:minimum_target:${result.minimumTarget}:${JSON.stringify(result.undersized)}`);
  if (result.primaryContrast !== null) assert.ok(result.primaryContrast >= 4.5, `${label}:primary_contrast:${result.primaryContrast}`);
  assert.equal(result.positiveTabindex, 0, `${label}:positive_tabindex`);
  return result;
}

async function main() {
  assert.ok(CHROME, "chrome_binary_required");
  rmSync(ARTIFACTS, { recursive: true, force: true }); mkdirSync(ARTIFACTS, { recursive: true });
  const profile = mkdtempSync(path.join(tmpdir(), "celebix-starter-commerce-chrome-"));
  const debugPort = await freePort();
  const chrome = spawn(CHROME, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--headless=new", "--disable-extensions", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let cdp;
  const consoleErrors = [], networkFailures = [], sensitiveSurface = { dom: false, console: false, networkUrl: false };
  try {
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
    const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const page = tabs.find((tab) => tab.type === "page" && tab.url === "about:blank")
      ?? tabs.find((tab) => tab.type === "page" && !tab.url.startsWith("chrome-extension://"));
    assert.ok(page?.webSocketDebuggerUrl, "browser_page_target_required");
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    cdp.on("Runtime.consoleAPICalled", ({ type, args = [] }) => { const text = args.map(({ value, description }) => String(value ?? description ?? "")).join(" "); if (/__Host-celebix_(?:cart|checkout_intent|customer|receipt)=|\b(?:c1|i1|u1|r1)\.[a-z][a-z0-9_-]{2,31}\.[A-Za-z0-9_-]{43}\b/u.test(text)) sensitiveSurface.console = true; if (["error", "assert"].includes(type)) consoleErrors.push(type); });
    cdp.on("Network.loadingFailed", ({ canceled }) => { if (!canceled) networkFailures.push("failed"); });
    cdp.on("Network.requestWillBeSent", ({ request }) => { if (/__Host-celebix_|(?:c1|i1|u1|r1)[.]current/iu.test(request.url)) sensitiveSurface.networkUrl = true; });

    const measurements = [], screenshots = [];
    await viewport(cdp, 1440, 900); await navigate(cdp, "/"); await waitFor(cdp, "document.querySelector('.starter-storefront')&&document.querySelector('.product-card-link')&&!document.body.innerText.includes('Mağaza yükleniyor')", "home");
    measurements.push(await measure(cdp, "desktop-1440x900")); screenshots.push(await screenshot(cdp, "home-1440x900.png"));
    await viewport(cdp, 1025, 768); await navigate(cdp, "/products"); await waitFor(cdp, "document.querySelector('.product-card-link')", "products"); measurements.push(await measure(cdp, "desktop-1025x768")); screenshots.push(await screenshot(cdp, "products-1025x768.png"));
    const productPath = await cdp.evaluate("document.querySelector('.product-card-link')?.getAttribute('href')"); assert.match(productPath, /^\/products\/[a-z0-9-]+$/u);
    await navigate(cdp, productPath); await waitFor(cdp, "document.querySelector('.purchase-panel input[type=radio]:not(:disabled)')?.closest('label')?.getClientRects().length", "available_variant");
    await click(cdp, "document.querySelector('.purchase-panel input[type=radio]:not(:disabled)')?.closest('label')", "variant");
    await click(cdp, "[...document.querySelectorAll('.purchase-actions button')].find((node)=>node.textContent.includes('Sepete ekle'))", "add_to_cart");
    try {
      await waitFor(cdp, "document.querySelector('.purchase-status')?.textContent.includes('sepete eklendi')", "cart_added");
    } catch (error) {
      const state = await cdp.evaluate("({status:document.querySelector('.purchase-status')?.textContent,buttons:[...document.querySelectorAll('.purchase-actions button')].map((node)=>({text:node.textContent,disabled:node.disabled})),path:location.pathname})");
      throw new Error(`${error.message}:${JSON.stringify(state)}`);
    }
    await navigate(cdp, "/products"); await waitFor(cdp, "document.querySelector('.favorite-button')?.getClientRects().length", "favorite_button");
    await click(cdp, "document.querySelector('.favorite-button')", "favorite");
    await navigate(cdp, "/favorites"); await waitFor(cdp, "document.querySelector('.product-card')", "favorite_resolved");
    await navigate(cdp, "/search?q=Altın"); await waitFor(cdp, "document.querySelector('.product-card')", "search_resolved");
    await navigate(cdp, productPath); await waitFor(cdp, "document.querySelector('.purchase-panel input[type=radio]:not(:disabled)')?.closest('label')?.getClientRects().length", "buy_variant"); await click(cdp, "document.querySelector('.purchase-panel input[type=radio]:not(:disabled)')?.closest('label')", "buy_variant");
    await click(cdp, "[...document.querySelectorAll('.purchase-actions button')].find((node)=>node.textContent.includes('Şimdi satın al'))", "buy_now");
    await waitFor(cdp, "location.pathname==='/checkout'&&location.search==='?intent=buy-now'", "buy_now_checkout");
    await viewport(cdp, 390, 844); await waitFor(cdp, "document.querySelectorAll('.checkout-fields input').length===8&&document.querySelector('.checkout-submit:not(:disabled)')", "checkout_form");
    for (const [name, value] of Object.entries({ name: "Güzide Elif", email: "info@example.com", phone: "+905551112233", addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy", postalCode: "34710", note: "Kapıyı çalınız." })) await fill(cdp, `[name="${name}"]`, value);
    measurements.push(await measure(cdp, "mobile-checkout-390x844")); screenshots.push(await screenshot(cdp, "checkout-390x844.png"));
    await click(cdp, "document.querySelector('.checkout-submit')", "delivery_continue"); await waitFor(cdp, "document.querySelector('.payment-methods input:checked')", "payment_method");
    await click(cdp, "[...document.querySelectorAll('.checkout-form-actions button')].find((node)=>node.textContent.includes('Siparişi oluştur'))", "complete_checkout");
    await waitFor(cdp, "location.pathname==='/checkout/success'&&document.body.innerText.includes('Sipariş alındı')", "receipt");
    screenshots.push(await screenshot(cdp, "receipt-390x844.png"));
    await navigate(cdp, "/account"); await waitFor(cdp, "document.querySelector('.account-order')", "account_order");
    await viewport(cdp, 1024, 768); measurements.push(await measure(cdp, "mobile-1024x768")); screenshots.push(await screenshot(cdp, "account-1024x768.png"));
    await navigate(cdp, "/cart"); await waitFor(cdp, "document.querySelector('.cart-line')", "separate_cart");
    await viewport(cdp, 320, 720); measurements.push(await measure(cdp, "mobile-cart-320x720")); screenshots.push(await screenshot(cdp, "cart-320x720.png"));
    await navigate(cdp, "/policies/privacy-security"); await waitFor(cdp, "document.body.innerText.includes('Gizlilik ve Güvenlik')", "policy"); measurements.push(await measure(cdp, "mobile-policy-320x720"));
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const reducedMotionDuration = await cdp.evaluate(`(() => { const node=document.createElement('div');node.className='loading-mark';document.body.append(node);const value=getComputedStyle(node).animationDuration;node.remove();return value; })()`);
    assert.ok(["1e-05s", "0.00001s", "0.01ms"].includes(reducedMotionDuration), `reduced_motion:${reducedMotionDuration}`);
    const bodyText = await cdp.evaluate("document.documentElement.innerHTML"); sensitiveSurface.dom = /__Host-celebix_(?:cart|checkout_intent|customer|receipt)=|\b(?:c1|i1|u1|r1)\.[a-z][a-z0-9_-]{2,31}\.[A-Za-z0-9_-]{43}\b/u.test(bodyText);
    assert.deepEqual(sensitiveSurface, { dom: false, console: false, networkUrl: false });
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(networkFailures, []);
    const result = Object.freeze({ baseOrigin: "loopback", viewportMatrix: VIEWPORTS.map(([width, height, label]) => ({ width, height, label })), measurements, reducedMotionDuration, screenshotCount: screenshots.length, screenshots: screenshots.map((file) => path.relative(ROOT, file)), consoleErrors: 0, networkFailures: 0, sensitiveSurface });
    writeFileSync(path.join(ARTIFACTS, "browser-acceptance.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`PASS starter commerce browser acceptance (${screenshots.length} screenshots)\n`);
  } finally {
    cdp?.close();
    if (chrome.exitCode === null) {
      chrome.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => chrome.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

await main();
