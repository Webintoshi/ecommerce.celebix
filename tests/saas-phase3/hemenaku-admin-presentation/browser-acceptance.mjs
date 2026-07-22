import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const FIXTURE = path.join(ROOT, "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture");
const ARTIFACTS = path.join(ROOT, ".codex-artifacts/hemenaku-admin-provider-workflows");
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHttp(url, label, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { redirect: "manual" }); if (response.status > 0) return response; }
    catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label}_timeout:${String(last ?? "unavailable")}`);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.code}:${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }
  once(method, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const release = this.on(method, (params) => { clearTimeout(timer); release(); resolve(params); });
      const timer = setTimeout(() => { release(); reject(new Error(`${method}_timeout`)); }, timeout);
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`browser_evaluation_failed:${result.exceptionDetails.text}`);
    return result.result?.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(cdp, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const diagnostic = await cdp.evaluate(`document.body?.innerText?.slice(0, 2000) ?? ""`).catch(() => "");
  throw new Error(`${label}_timeout:${diagnostic}`);
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, screenWidth: width, screenHeight: height,
    deviceScaleFactor: 1, mobile: width <= 1024,
  });
  const deadline = Date.now() + 2_000;
  let value;
  do {
    value = await cdp.evaluate(`({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})`);
    if (value.width === width) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.equal(value.width, width);
  assert.equal(value.scrollWidth, width, `horizontal overflow at ${width}px`);
  return value;
}

async function screenshot(cdp, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  const target = path.join(ARTIFACTS, name);
  writeFileSync(target, Buffer.from(data, "base64"));
  return target;
}

async function clickByText(cdp, text) {
  const clicked = await cdp.evaluate(`(() => { const label=${JSON.stringify(text)}; const target=[...document.querySelectorAll('button,a')].find((entry)=>(entry.textContent?.includes(label)||entry.getAttribute('aria-label')===label)&&entry.getClientRects().length); if(!target)return false; target.click(); return true; })()`);
  assert.equal(clicked, true, `missing interactive target: ${text}`);
}

async function pressEscape(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
}

function contrastExpression() {
  return `(() => { const button=[...document.querySelectorAll('button')].find((entry)=>entry.textContent?.includes('Yeni kayıt')); if(!button)return 0; const style=getComputedStyle(button); const rgb=(value)=>value.match(/[\\d.]+/g).slice(0,3).map(Number); const lum=(value)=>rgb(value).map((part)=>part/255).map((part)=>part<=.03928?part/12.92:Math.pow((part+.055)/1.055,2.4)).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0); const a=lum(style.color),b=lum(style.backgroundColor); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); })()`;
}

async function main() {
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("LOCAL_CHROME_REQUIRED");
  mkdirSync(ARTIFACTS, { recursive: true });
  const [appPort, debugPort] = await Promise.all([freePort(), freePort()]);
  const origin = `http://127.0.0.1:${appPort}`;
  const profile = mkdtempSync(path.join(tmpdir(), "celebix-browser-acceptance-"));
  const next = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", FIXTURE, "--webpack", "-p", String(appPort)], {
    cwd: ROOT, env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let nextLog = "";
  next.stdout.on("data", (value) => { nextLog += value; });
  next.stderr.on("data", (value) => { nextLog += value; });
  const browser = spawn(chrome, ["--headless=new", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let cdp;
  try {
    await Promise.all([waitForHttp(`${origin}/marketplaces`, "fixture"), waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, "chrome")]);
    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" }).then((response) => response.json());
    cdp = new Cdp(target.webSocketDebuggerUrl);
    const consoleErrors = [], exceptions = [], networkUrls = [];
    cdp.on("Runtime.consoleAPICalled", ({ type, args }) => { if (["error", "assert"].includes(type)) consoleErrors.push(args.map(({ value, description }) => value ?? description).join(" ")); });
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => exceptions.push(exceptionDetails.text));
    cdp.on("Network.requestWillBeSent", ({ request }) => networkUrls.push(request.url));
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    await setViewport(cdp, 1280, 800);
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: `${origin}/marketplaces` });
    await loaded;
    await waitFor(cdp, `document.body.innerText.includes('Trendyol Pilot Mağaza')`, "records");

    const desktop = await cdp.evaluate(`({sidebar:getComputedStyle(document.querySelector('aside')).display,dock:getComputedStyle(document.querySelector('nav[aria-label="Mobil panel menüsü"]')).display})`);
    assert.notEqual(desktop.sidebar, "none");
    assert.equal(desktop.dock, "none");
    const contrast = await cdp.evaluate(contrastExpression());
    assert.ok(contrast >= 4.5, `primary contrast ${contrast}`);

    await clickByText(cdp, "Yeni kayıt");
    await waitFor(cdp, `document.querySelector('[role="dialog"][aria-modal="true"]')!==null`, "editor");
    await pressEscape(cdp);
    await waitFor(cdp, `document.querySelector('[role="dialog"][aria-modal="true"]')===null&&document.activeElement?.textContent?.includes('Yeni kayıt')`, "editor_focus_restore");

    await cdp.evaluate(`(() => { const input=document.querySelector('input[aria-label="Kayıt ara"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'eşleşmeyen'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor(cdp, `document.body.innerText.includes('Filtreyle eşleşen kayıt yok')`, "search_filter");
    await cdp.evaluate(`(() => { const input=document.querySelector('input[aria-label="Kayıt ara"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor(cdp, `document.body.innerText.includes('Trendyol Pilot Mağaza')`, "search_reset");

    await clickByText(cdp, "Senkronizasyon hazırlığı oluştur");
    await waitFor(cdp, `document.body.innerText.includes('Sağlayıcı aktivasyonu bekleniyor')&&document.body.innerText.includes('Hazırlığı iptal et')`, "provider_prepare");
    const desktopShot = await screenshot(cdp, "provider-workflow-desktop-1280x800.png");

    const at1024 = await setViewport(cdp, 1024, 768);
    const mobileBoundary = await cdp.evaluate(`({sidebar:getComputedStyle(document.querySelector('aside')).display,dock:getComputedStyle(document.querySelector('nav[aria-label="Mobil panel menüsü"]')).display})`);
    assert.equal(mobileBoundary.sidebar, "none"); assert.notEqual(mobileBoundary.dock, "none"); assert.equal(at1024.scrollWidth, 1024);
    await screenshot(cdp, "provider-workflow-boundary-1024x768.png");

    await setViewport(cdp, 1025, 768);
    const desktopBoundary = await cdp.evaluate(`({sidebar:getComputedStyle(document.querySelector('aside')).display,dock:getComputedStyle(document.querySelector('nav[aria-label="Mobil panel menüsü"]')).display})`);
    assert.notEqual(desktopBoundary.sidebar, "none"); assert.equal(desktopBoundary.dock, "none");
    await screenshot(cdp, "provider-workflow-boundary-1025x768.png");

    await setViewport(cdp, 390, 844);
    const minimumTarget = await cdp.evaluate(`Math.min(...[...document.querySelectorAll('button,a,input,select,textarea')].filter((entry)=>entry.getClientRects().length).map((entry)=>Math.min(entry.getBoundingClientRect().width,entry.getBoundingClientRect().height)))`);
    assert.ok(minimumTarget >= 48, `minimum target ${minimumTarget}`);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await clickByText(cdp, "Panel menüsünü aç");
    await waitFor(cdp, `document.querySelector('#panel-mobile-drawer')!==null`, "mobile_drawer");
    const reducedMotion = await cdp.evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,duration:getComputedStyle(document.querySelector('#panel-mobile-drawer')).transitionDuration,overflow:document.body.style.overflow})`);
    assert.equal(reducedMotion.matches, true); assert.equal(reducedMotion.overflow, "hidden"); assert.match(reducedMotion.duration, /0\.00001s|1e-05s|0s/);
    await screenshot(cdp, "provider-workflow-mobile-drawer-390x844.png");
    await pressEscape(cdp);
    await waitFor(cdp, `document.querySelector('#panel-mobile-drawer')===null&&document.activeElement?.getAttribute('aria-label')==='Panel menüsünü aç'`, "mobile_focus_restore");
    const mobileShot = await screenshot(cdp, "provider-workflow-mobile-390x844.png");

    await setViewport(cdp, 320, 720);
    const bottomClearance = await cdp.evaluate(`(() => { const dock=document.querySelector('nav[aria-label="Mobil panel menüsü"]'); const workspace=document.querySelector('main').parentElement; return {overflow:document.documentElement.scrollWidth-innerWidth,paddingBottom:parseFloat(getComputedStyle(workspace).paddingBottom),dockHeight:dock.getBoundingClientRect().height}; })()`);
    assert.equal(bottomClearance.overflow, 0); assert.ok(bottomClearance.paddingBottom >= bottomClearance.dockHeight);
    await screenshot(cdp, "provider-workflow-mobile-320x720.png");

    await setViewport(cdp, 1280, 800);
    await clickByText(cdp, "Hazırlığı iptal et");
    await waitFor(cdp, `document.body.innerText.includes('İptal edildi')&&!document.body.innerText.includes('Hazırlığı iptal et')`, "provider_cancel");
    const cancelledShot = await screenshot(cdp, "provider-workflow-cancelled-1280x800.png");

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(exceptions, []);
    assert.equal(networkUrls.every((url) => url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")), true);
    const result = Object.freeze({
      screenshots: [desktopShot, mobileShot, cancelledShot],
      measurements: { contrast, minimumTarget, overflowAt1024: at1024.scrollWidth - 1024, reducedMotionDuration: reducedMotion.duration, bottomDockClearance: bottomClearance.paddingBottom - bottomClearance.dockHeight },
      consoleErrors: consoleErrors.length,
      runtimeExceptions: exceptions.length,
      externalRequests: networkUrls.filter((url) => !url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")).length,
    });
    writeFileSync(path.join(ARTIFACTS, "browser-acceptance.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`PASS — cumulative local browser acceptance\n${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\nNEXT_LOG\n${nextLog.slice(-8000)}\n`);
    process.exitCode = 1;
  } finally {
    cdp?.close();
    browser.kill("SIGTERM");
    next.kill("SIGTERM");
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
