import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const FIXTURE = path.join(ROOT, "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture");
const ARTIFACTS = path.join(ROOT, ".codex-artifacts/hemenaku-admin-full-parity");
const VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900, "desktop-1440x900"]),
  Object.freeze([1280, 800, "desktop-1280x800"]),
  Object.freeze([1025, 768, "boundary-desktop-1025x768"]),
  Object.freeze([1024, 768, "boundary-mobile-1024x768"]),
  Object.freeze([390, 844, "mobile-390x844"]),
  Object.freeze([320, 720, "mobile-320x720"]),
]);
const REPRESENTATIVE_ROUTES = Object.freeze([
  "/",
  "/analytics",
  "/orders/ORDER_ID/print",
  "/customers/CUSTOMER_ID/edit",
  "/products/extras/RESOURCE_ID/preview",
  "/products/purchasing",
  "/products/inventory-counts",
  "/products/transfers",
  "/products/price-lists",
  "/seo/products",
  "/products/shopify-converter",
]);
const SCREENSHOTS = Object.freeze([
  "dashboard-desktop-1440x900.png",
  "analytics-desktop-1280x800.png",
  "orders-print-desktop-1280x800.png",
  "catalog-editor-desktop-1280x800.png",
  "settings-desktop-1280x800.png",
  "seo-desktop-1280x800.png",
  "boundary-desktop-1025x768.png",
  "boundary-mobile-1024x768.png",
  "dashboard-mobile-390x844.png",
  "drawer-mobile-390x844.png",
  "products-mobile-390x844.png",
  "inventory-count-mobile-390x844.png",
  "price-lists-mobile-390x844.png",
  "dashboard-mobile-320x720.png",
]);
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
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return response;
    } catch (error) {
      last = error;
    }
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
      const release = this.on(method, (params) => {
        clearTimeout(timer);
        release();
        resolve(params);
      });
      const timer = setTimeout(() => {
        release();
        reject(new Error(`${method}_timeout`));
      }, timeout);
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(`browser_evaluation_failed:${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
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

async function setViewport(cdp, viewport, matrixSeen) {
  const [width, height, label] = viewport;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    screenWidth: width,
    screenHeight: height,
    deviceScaleFactor: 1,
    mobile: width <= 1024,
  });
  await waitFor(cdp, `innerWidth===${width}&&innerHeight===${height}`, `viewport_${label}`);
  matrixSeen.add(label);
}

async function navigate(cdp, origin, route, loaded = true) {
  const event = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: `${origin}${route}` });
  await event;
  await waitFor(cdp, `location.pathname===${JSON.stringify(route)}`, `route_${route}`);
  if (loaded) await waitFor(cdp, `document.querySelector('[data-loaded="true"]')!==null`, `loaded_${route}`);
}

async function screenshot(cdp, index) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const target = path.join(ARTIFACTS, SCREENSHOTS[index]);
  writeFileSync(target, Buffer.from(data, "base64"));
  return target;
}

async function clickByText(cdp, text) {
  const clicked = await cdp.evaluate(`(() => {
    const label=${JSON.stringify(text)};
    const target=[...document.querySelectorAll('button,a')].find((entry)=>(entry.textContent?.includes(label)||entry.getAttribute('aria-label')===label)&&entry.getClientRects().length);
    if(!target)return false;
    target.click();
    return true;
  })()`);
  assert.equal(clicked, true, `missing interactive target: ${text}`);
}

async function pressEscape(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
}

async function measurePage(cdp, label) {
  const value = await cdp.evaluate(`(() => {
    const visible=(entry)=>{
      const style=getComputedStyle(entry),rect=entry.getBoundingClientRect();
      return entry.getClientRects().length>0&&style.visibility!=='hidden'&&style.display!=='none'&&rect.width>0&&rect.height>0;
    };
    const targets=[...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(visible);
    const dimensions=targets.map((entry)=>{const rect=entry.getBoundingClientRect();return {label:entry.getAttribute('aria-label')||entry.textContent?.trim().slice(0,60)||entry.tagName,width:rect.width,height:rect.height};});
    const parse=(color)=>{const values=color.match(/[\\d.]+/g)?.slice(0,3).map(Number);return values?.length===3?values:[0,0,0];};
    const luminance=(color)=>parse(color).map((part)=>part/255).map((part)=>part<=.03928?part/12.92:Math.pow((part+.055)/1.055,2.4)).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0);
    const primary=[...document.querySelectorAll('[data-primary-action]')].filter(visible).map((entry)=>{const style=getComputedStyle(entry),foreground=luminance(style.color),background=luminance(style.backgroundColor);return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);});
    return {
      width:innerWidth,
      height:innerHeight,
      horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
      minimumTarget:dimensions.length?Math.min(...dimensions.map(({width,height})=>Math.min(width,height))):0,
      undersized:dimensions.filter(({width,height})=>width<48||height<48),
      primaryContrast:primary.length?Math.min(...primary):0,
    };
  })()`);
  assert.equal(value.horizontalOverflow, 0, `${label} horizontal overflow`);
  assert.deepEqual(value.undersized, [], `${label} has targets smaller than 48px`);
  assert.ok(value.minimumTarget >= 48, `${label} minimum target ${value.minimumTarget}`);
  assert.ok(value.primaryContrast >= 4.5, `${label} primary orange contrast ${value.primaryContrast}`);
  return Object.freeze({ label, ...value });
}

async function touchTargetDiagnostics(cdp) {
  return cdp.evaluate(`(() => {
    const sidebar=document.querySelector('aside:not(#panel-mobile-drawer)');
    const byText=(selector,text)=>[...sidebar.querySelectorAll(selector)].find((entry)=>entry.textContent?.trim().includes(text));
    const selected={
      workingPrimary:byText('a','Özet'),
      workingGroup:byText('a','Siparişler'),
      nestedLink:byText('a','Tüm Siparişler'),
      logout:sidebar.querySelector('button.logout-button'),
    };
    const matchedRules=(element)=>{
      const matches=[];
      const visit=(rules,source)=>{
        for(const rule of rules??[]){
          if(!rule.selectorText&&rule.cssRules){visit(rule.cssRules,source);continue;}
          if(!rule.selectorText)continue;
          let matched=false;
          for(const selector of rule.selectorText.split(',')){
            try{if(element.matches(selector.trim())){matched=true;break;}}catch{}
          }
          if(matched&&/(min-height|padding|line-height|font-size|box-sizing)/.test(rule.cssText))matches.push({source,selector:rule.selectorText,cssText:rule.cssText});
        }
      };
      for(const sheet of document.styleSheets){try{visit(sheet.cssRules,sheet.href??'inline');}catch{}}
      return matches;
    };
    const inspect=(element)=>{
      if(!element)return {missing:true};
      const style=getComputedStyle(element),rect=element.getBoundingClientRect();
      return {
        tag:element.tagName.toLowerCase(),
        text:element.textContent?.trim(),
        className:element.className,
        rect:{width:rect.width,height:rect.height},
        computed:{
          minHeight:style.minHeight,
          height:style.height,
          paddingTop:style.paddingTop,
          paddingBottom:style.paddingBottom,
          lineHeight:style.lineHeight,
          fontSize:style.fontSize,
          borderTopWidth:style.borderTopWidth,
          borderBottomWidth:style.borderBottomWidth,
          boxSizing:style.boxSizing,
        },
        matchedRules:matchedRules(element),
      };
    };
    return Object.fromEntries(Object.entries(selected).map(([key,element])=>[key,inspect(element)]));
  })()`);
}

async function shellMode(cdp) {
  return cdp.evaluate(`(() => {
    const sidebar=document.querySelector('aside:not(#panel-mobile-drawer)');
    const dock=document.querySelector('nav[aria-label="Mobil panel menüsü"]');
    return {desktop:sidebar?getComputedStyle(sidebar).display!=='none':false,mobile:dock?getComputedStyle(dock).display!=='none':false};
  })()`);
}

async function openDrawer(cdp) {
  const opened = await cdp.evaluate(`(() => {const button=document.querySelector('button[aria-label="Panel menüsünü aç"]');if(!button)return false;button.click();return true;})()`);
  assert.equal(opened, true);
  await waitFor(cdp, `document.querySelector('#panel-mobile-drawer')!==null`, "drawer_open");
}

async function assertDrawerClosedAndFocused(cdp, label) {
  await waitFor(cdp, `document.querySelector('#panel-mobile-drawer')===null&&document.activeElement?.getAttribute('aria-label')==='Panel menüsünü aç'`, `drawer_${label}_focusRestored`);
  return true;
}

async function exerciseProviderFixture(cdp, origin) {
  await navigate(cdp, origin, "/marketplaces", false);
  await waitFor(cdp, `document.body.innerText.includes('Trendyol Pilot Mağaza')`, "provider_records");
  await clickByText(cdp, "Yeni kayıt");
  await waitFor(cdp, `document.querySelector('[role="dialog"][aria-modal="true"]')!==null`, "provider_editor");
  await pressEscape(cdp);
  await waitFor(cdp, `document.querySelector('[role="dialog"][aria-modal="true"]')===null`, "provider_editor_closed");
  await clickByText(cdp, "Senkronizasyon hazırlığı oluştur");
  await waitFor(cdp, `document.body.innerText.includes('Sağlayıcı aktivasyonu bekleniyor')&&document.body.innerText.includes('Hazırlığı iptal et')`, "provider_prepare");
  await clickByText(cdp, "Hazırlığı iptal et");
  await waitFor(cdp, `document.body.innerText.includes('İptal edildi')`, "provider_cancel");
}

function isPermittedNetworkUrl(value) {
  if (value.startsWith("data:") || value.startsWith("blob:")) return true;
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 5_000))]);
  if (!stopped) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function main() {
  assert.equal(VIEWPORTS.length, 6);
  assert.equal(REPRESENTATIVE_ROUTES.length, 11);
  assert.equal(SCREENSHOTS.length, 14);
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("LOCAL_CHROME_REQUIRED");
  mkdirSync(ARTIFACTS, { recursive: true });
  const [appPort, debugPort] = await Promise.all([freePort(), freePort()]);
  const origin = `http://127.0.0.1:${appPort}`;
  const profile = mkdtempSync(path.join(tmpdir(), "celebix-full-parity-browser-"));
  const next = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", FIXTURE, "--webpack", "-p", String(appPort)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let nextLog = "";
  next.stdout.on("data", (value) => { nextLog += value; });
  next.stderr.on("data", (value) => { nextLog += value; });
  const browser = spawn(chrome, [
    "--headless=new",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  let cdp;
  try {
    await Promise.all([
      waitForHttp(`${origin}/`, "fixture"),
      waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, "chrome"),
    ]);
    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" }).then((response) => response.json());
    cdp = new Cdp(target.webSocketDebuggerUrl);
    const consoleErrors = [];
    const exceptions = [];
    const networkUrls = [];
    cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
      if (["error", "assert"].includes(type)) consoleErrors.push(args.map(({ value, description }) => value ?? description).join(" "));
    });
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text));
    cdp.on("Network.requestWillBeSent", ({ request }) => networkUrls.push(request.url));
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);

    const matrixSeen = new Set();
    const viewportMeasurements = [];
    const screenshots = [];

    await setViewport(cdp, VIEWPORTS[1], matrixSeen);
    await exerciseProviderFixture(cdp, origin);

    await setViewport(cdp, VIEWPORTS[0], matrixSeen);
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[0]);
    if (process.env.CELEBIX_TOUCH_DIAGNOSTICS === "1") {
      process.stdout.write(`TOUCH_TARGET_DIAGNOSTICS\n${JSON.stringify(await touchTargetDiagnostics(cdp), null, 2)}\n`);
    }
    viewportMeasurements.push(await measurePage(cdp, "dashboard desktop-1440x900"));
    screenshots.push(await screenshot(cdp, 0));

    await setViewport(cdp, VIEWPORTS[1], matrixSeen);
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[1]);
    viewportMeasurements.push(await measurePage(cdp, "analytics desktop-1280x800"));
    screenshots.push(await screenshot(cdp, 1));
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[2]);
    viewportMeasurements.push(await measurePage(cdp, "orders print desktop-1280x800"));
    screenshots.push(await screenshot(cdp, 2));
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[4]);
    viewportMeasurements.push(await measurePage(cdp, "catalog editor desktop-1280x800"));
    screenshots.push(await screenshot(cdp, 3));
    await navigate(cdp, origin, "/settings");
    viewportMeasurements.push(await measurePage(cdp, "settings desktop-1280x800"));
    screenshots.push(await screenshot(cdp, 4));
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[9]);
    viewportMeasurements.push(await measurePage(cdp, "seo desktop-1280x800"));
    screenshots.push(await screenshot(cdp, 5));
    for (const route of [REPRESENTATIVE_ROUTES[3], REPRESENTATIVE_ROUTES[5], REPRESENTATIVE_ROUTES[7], REPRESENTATIVE_ROUTES[10]]) {
      await navigate(cdp, origin, route);
      viewportMeasurements.push(await measurePage(cdp, `${route} desktop-1280x800`));
    }

    await setViewport(cdp, VIEWPORTS[2], matrixSeen);
    await navigate(cdp, origin, "/");
    const boundaryDesktop = await shellMode(cdp);
    assert.deepEqual(boundaryDesktop, { desktop: true, mobile: false });
    viewportMeasurements.push(await measurePage(cdp, "boundary desktop-1025x768"));
    screenshots.push(await screenshot(cdp, 6));

    await setViewport(cdp, VIEWPORTS[3], matrixSeen);
    await navigate(cdp, origin, "/");
    const boundaryMobile = await shellMode(cdp);
    assert.deepEqual(boundaryMobile, { desktop: false, mobile: true });
    viewportMeasurements.push(await measurePage(cdp, "boundary mobile-1024x768"));
    screenshots.push(await screenshot(cdp, 7));

    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await setViewport(cdp, VIEWPORTS[4], matrixSeen);
    await navigate(cdp, origin, "/");
    viewportMeasurements.push(await measurePage(cdp, "dashboard mobile-390x844"));
    screenshots.push(await screenshot(cdp, 8));

    await openDrawer(cdp);
    const reducedMotion = await cdp.evaluate(`(() => {
      const drawer=document.querySelector('#panel-mobile-drawer'),style=getComputedStyle(drawer);
      const durations=[style.transitionDuration,style.animationDuration].flatMap((entry)=>entry.split(',').map((value)=>value.trim()));
      return {matches:matchMedia('(prefers-reduced-motion: reduce)').matches,reducedMotionDuration:durations};
    })()`);
    assert.equal(reducedMotion.matches, true);
    assert.ok(reducedMotion.reducedMotionDuration.every((value) => ["0s", "0.00001s", "1e-05s"].includes(value)), JSON.stringify(reducedMotion));
    screenshots.push(await screenshot(cdp, 9));
    await pressEscape(cdp);
    const escapeFocus = await assertDrawerClosedAndFocused(cdp, "Escape");

    await openDrawer(cdp);
    const backdropClicked = await cdp.evaluate(`(() => {const button=document.querySelector('button[aria-label="Panel menüsünü kapat"]');if(!button)return false;button.click();return true;})()`);
    assert.equal(backdropClicked, true);
    const backdropFocus = await assertDrawerClosedAndFocused(cdp, "backdrop");

    await openDrawer(cdp);
    const closeButtonClicked = await cdp.evaluate(`(() => {const button=document.querySelector('#panel-mobile-drawer button[aria-label="Panel menüsünü kapat"]');if(!button)return false;button.click();return true;})()`);
    assert.equal(closeButtonClicked, true);
    const closeButtonFocus = await assertDrawerClosedAndFocused(cdp, "close-button");

    await openDrawer(cdp);
    const swiped = await cdp.evaluate(`(() => {
      const drawer=document.querySelector('#panel-mobile-drawer');
      if(!drawer)return false;
      const dispatch=(type,touches)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:touches});drawer.dispatchEvent(event);};
      dispatch('touchstart',[{clientX:100}]);
      dispatch('touchmove',[{clientX:180}]);
      dispatch('touchend',[]);
      return true;
    })()`);
    assert.equal(swiped, true);
    const swipeFocus = await assertDrawerClosedAndFocused(cdp, "swipe");

    await navigate(cdp, origin, "/products");
    viewportMeasurements.push(await measurePage(cdp, "products mobile-390x844"));
    screenshots.push(await screenshot(cdp, 10));
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[6]);
    viewportMeasurements.push(await measurePage(cdp, "inventory count mobile-390x844"));
    screenshots.push(await screenshot(cdp, 11));
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[8]);
    viewportMeasurements.push(await measurePage(cdp, "price lists mobile-390x844"));
    screenshots.push(await screenshot(cdp, 12));

    await setViewport(cdp, VIEWPORTS[5], matrixSeen);
    await navigate(cdp, origin, "/");
    viewportMeasurements.push(await measurePage(cdp, "dashboard mobile-320x720"));
    const dockMeasurements = await cdp.evaluate(`(() => {
      const dock=document.querySelector('nav[aria-label="Mobil panel menüsü"]');
      const workspace=document.querySelector('main')?.parentElement;
      const input=document.querySelector('input[aria-label="Kayıtlarda ara"]');
      input.focus();
      input.scrollIntoView({block:'center'});
      const dockRect=dock.getBoundingClientRect(),inputRect=input.getBoundingClientRect();
      return {
        workspaceBottomPadding:parseFloat(getComputedStyle(workspace).paddingBottom),
        dockHeight:dockRect.height,
        focusedInputDockClearance:dockRect.top-inputRect.bottom,
        horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
      };
    })()`);
    assert.ok(dockMeasurements.workspaceBottomPadding >= dockMeasurements.dockHeight, JSON.stringify(dockMeasurements));
    assert.ok(dockMeasurements.focusedInputDockClearance >= 0, JSON.stringify(dockMeasurements));
    assert.equal(dockMeasurements.horizontalOverflow, 0);
    screenshots.push(await screenshot(cdp, 13));

    await setViewport(cdp, VIEWPORTS[1], matrixSeen);
    await navigate(cdp, origin, "/products-evil");
    const productsEvilActive = await cdp.evaluate(`document.querySelector('a[href="/products"]')?.getAttribute('aria-current')==='page'`);
    assert.equal(productsEvilActive, false);
    const replay = await cdp.evaluate(`(async()=>{
      const mutation=()=>fetch('/api/fixture/catalog-summary',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({operationId:'full-parity-replay'})}).then((response)=>response.json());
      return [await mutation(),await mutation()];
    })()`);
    assert.equal(replay[0].replayed, false);
    assert.equal(replay[1].replayed, true);

    assert.deepEqual([...matrixSeen].sort(), VIEWPORTS.map((entry) => entry[2]).sort());
    assert.equal(screenshots.length, 14);
    assert.deepEqual(readdirSync(ARTIFACTS).filter((entry) => entry.endsWith(".png")).sort(), [...SCREENSHOTS].sort());
    const externalUrls = networkUrls.filter((url) => !isPermittedNetworkUrl(url));
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(exceptions, []);
    assert.deepEqual(externalUrls, []);

    const minimumTarget = Math.min(...viewportMeasurements.map((entry) => entry.minimumTarget));
    const primaryContrast = Math.min(...viewportMeasurements.map((entry) => entry.primaryContrast));
    const horizontalOverflow = Math.max(...viewportMeasurements.map((entry) => entry.horizontalOverflow));
    const result = Object.freeze({
      screenshots,
      screenshotCount: screenshots.length,
      routes: REPRESENTATIVE_ROUTES,
      routeCount: REPRESENTATIVE_ROUTES.length,
      viewports: VIEWPORTS.map(([width, height, label]) => ({ width, height, label })),
      viewportCount: matrixSeen.size,
      measurements: {
        minimumTarget,
        primaryContrast,
        horizontalOverflow,
        reducedMotionDuration: reducedMotion.reducedMotionDuration,
        workspaceBottomPadding: dockMeasurements.workspaceBottomPadding,
        dockHeight: dockMeasurements.dockHeight,
        focusedInputDockClearance: dockMeasurements.focusedInputDockClearance,
        boundaryMode: { at1024: boundaryMobile, at1025: boundaryDesktop },
        productsEvilActive,
        drawerDismissals: {
          Escape: { focusRestored: escapeFocus },
          backdrop: { focusRestored: backdropFocus },
          "close-button": { focusRestored: closeButtonFocus },
          swipe: { focusRestored: swipeFocus },
        },
        viewportMeasurements,
      },
      mutationReplay: replay,
      consoleErrors: consoleErrors.length,
      runtimeExceptions: exceptions.length,
      externalRequests: externalUrls.length,
      networkRequests: networkUrls.length,
    });
    writeFileSync(path.join(ARTIFACTS, "browser-acceptance.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`PASS — full merchant local browser acceptance\n${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\nNEXT_LOG\n${nextLog.slice(-12_000)}\n`);
    process.exitCode = 1;
  } finally {
    cdp?.close();
    await Promise.all([stopProcess(browser), stopProcess(next)]);
    rmSync(profile, { recursive: true, force: true });
  }
}

if (process.env.CELEBIX_RUN_LOCAL_BROWSER_ACCEPTANCE !== "1") {
  process.stdout.write("SKIP — set CELEBIX_RUN_LOCAL_BROWSER_ACCEPTANCE=1 for dependency-free local Chromium acceptance\n");
} else {
  await main();
}
