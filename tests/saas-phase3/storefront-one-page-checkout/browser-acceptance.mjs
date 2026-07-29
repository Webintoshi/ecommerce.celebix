import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHECKOUT_BROWSER_HOSTS,
  startCheckoutBrowserFixture,
} from "./browser-fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AXE = path.join(ROOT, "node_modules/axe-core/axe.min.js");
const NOW = "2026-07-29T12:00:00.000Z";
const CDP_TIMEOUT = 20_000;
const SCREENSHOTS = Object.freeze([
  Object.freeze({ host: 0, height: 900, name: "store-a-starter-desktop-1280x900.png", width: 1280 }),
  Object.freeze({ host: 0, height: 844, name: "store-a-starter-mobile-390x844.png", width: 390 }),
  Object.freeze({ host: 1, height: 900, name: "store-b-hemenaku-desktop-1280x900.png", width: 1280 }),
  Object.freeze({ host: 1, height: 844, name: "store-b-hemenaku-mobile-390x844.png", width: 390 }),
]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

assert.deepEqual(
  CHECKOUT_BROWSER_HOSTS.map(({ hostname, themeKey }) => [hostname, themeKey]),
  [
    ["store-a.checkout.test", "starter"],
    ["store-b.checkout.test", "hemenaku"],
  ],
);
assert.equal(existsSync(AXE), true, "locked axe-core browser asset is required");

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

async function waitForHttp(url, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last = "unavailable";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status > 0) return response;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}_timeout:${last}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!graceful) {
    child.kill("SIGKILL");
    await exited;
  }
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cdp_open_timeout")), CDP_TIMEOUT);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("cdp_open_error"));
      }, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${message.error.code}:${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params ?? {});
      }
    });
    this.socket.addEventListener("error", () => this.reject(new Error("cdp_socket_error")));
    this.socket.addEventListener("close", () => this.reject(new Error("cdp_socket_closed")));
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  reject(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async send(method, params = {}, timeout = CDP_TIMEOUT) {
    await this.ready;
    const id = ++this.sequence;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}_timeout`));
      }, timeout);
      this.pending.set(id, { reject, resolve, timer });
    });
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
    const result = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `browser_evaluation_failed:${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      );
    }
    return result.result?.value;
  }

  async close() {
    this.listeners.clear();
    this.reject(new Error("cdp_closed"));
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, "complete");
  }
}

async function waitFor(cdp, expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  const diagnostic = await cdp.evaluate(
    `document.body?.innerText?.replace(/\\s+/g," ").slice(0,2000)??""`,
  ).catch(() => "");
  throw new Error(`${label}_timeout:${diagnostic}`);
}

async function viewport(cdp, width, height, scale = 1) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: scale,
    height,
    mobile: width <= 767,
    screenHeight: height,
    screenWidth: width,
    width,
  });
  await waitFor(cdp, `innerWidth===${width}&&innerHeight===${height}`, `viewport_${width}x${height}`);
}

async function setCartCookie(cdp, host) {
  const url = `https://${host.hostname}/`;
  const result = await cdp.send("Network.setCookie", {
    httpOnly: true,
    name: "__Host-celebix_cart",
    path: "/",
    sameSite: "Lax",
    secure: true,
    url,
    value: host.credential,
  });
  assert.equal(result.success, true, `${host.hostname} cart cookie`);
  const visible = await cdp.send("Network.getCookies", { urls: [url] });
  assert.equal(
    visible.cookies.some((cookie) =>
      cookie.name === "__Host-celebix_cart"
      && cookie.value === host.credential
      && cookie.domain === host.hostname
      && cookie.path === "/"
      && cookie.secure
      && cookie.httpOnly),
    true,
    `${host.hostname} host-only cart cookie`,
  );
}

async function navigate(cdp, host, pathname = "/odeme") {
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: `https://${host.hostname}${pathname}` });
  await loaded;
  await waitFor(
    cdp,
    `location.hostname===${JSON.stringify(host.hostname)}&&location.pathname===${JSON.stringify(pathname)}`,
    `route_${host.hostname}_${pathname}`,
  );
  await waitFor(cdp, `document.querySelector("h1")!==null`, `content_${host.hostname}_${pathname}`);
}

async function checkoutReady(cdp, host) {
  await waitFor(
    cdp,
    `[...document.querySelectorAll("[data-checkout-root]")].some(root=>
      root.getBoundingClientRect().width>0
      && root.querySelector("h1")?.textContent===${JSON.stringify(host.storeName)})`,
    `checkout_${host.hostname}`,
  );
  await cdp.evaluate(`(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return true})()`);
}

async function setInput(cdp, selector, value) {
  await cdp.evaluate(`(()=>{
    const input=(globalThis.__checkoutRoot?.()??document).querySelector(${JSON.stringify(selector)});
    if(!(input instanceof HTMLInputElement))throw new Error(${JSON.stringify(`missing_input:${selector}`)});
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
    setter.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    return true;
  })()`);
}

async function click(cdp, selector) {
  await cdp.evaluate(`(()=>{
    const node=(globalThis.__checkoutRoot?.()??document).querySelector(${JSON.stringify(selector)});
    if(!(node instanceof HTMLElement))throw new Error(${JSON.stringify(`missing_click:${selector}`)});
    node.click();
    return true;
  })()`);
}

async function key(cdp, value, code = value) {
  const windowsVirtualKeyCode = value === "Enter" ? 13
    : value === "Tab" ? 9
      : value === " " ? 32
        : undefined;
  await cdp.send("Input.dispatchKeyEvent", {
    code,
    key: value,
    ...(windowsVirtualKeyCode === undefined
      ? {}
      : {
          nativeVirtualKeyCode: windowsVirtualKeyCode,
          windowsVirtualKeyCode,
        }),
    ...(value === "Enter"
      ? { text: "\r", unmodifiedText: "\r" }
      : value === " "
        ? { text: " ", unmodifiedText: " " }
        : {}),
    type: value === "Enter" || value === " " ? "keyDown" : "rawKeyDown",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    code,
    key: value,
    ...(windowsVirtualKeyCode === undefined
      ? {}
      : {
          nativeVirtualKeyCode: windowsVirtualKeyCode,
          windowsVirtualKeyCode,
        }),
    type: "keyUp",
  });
}

async function keyboardDelivery(cdp) {
  const initialVersion = await cdp.evaluate(
    `Number(globalThis.__checkoutRoot().querySelector('input[name="cartVersion"]')?.value)`,
  );
  const values = Object.freeze({
    email: "ada@example.test",
    firstName: "Ada",
    lastName: "Yılmaz",
    phone: "+905551112233",
    line1: "Bağdat Caddesi 1",
    line2: "Kat 2",
    city: "İstanbul",
    district: "Kadıköy",
    postalCode: "34710",
  });
  await cdp.evaluate(`globalThis.__checkoutRoot().querySelector('input[name="email"]').focus()`);
  for (const [index, [name, value]] of Object.entries(values).entries()) {
    const active = await cdp.evaluate(`document.activeElement?.getAttribute("name")`);
    assert.equal(active, name, `keyboard field order ${name}`);
    await cdp.send("Input.insertText", { text: value });
    await key(cdp, "Tab");
    if (index === 0) {
      assert.equal(
        await cdp.evaluate(`document.activeElement?.getAttribute("name")`),
        "marketingOptIn",
      );
      await key(cdp, "Tab");
    }
  }
  assert.equal(
    await cdp.evaluate(`document.activeElement?.getAttribute("name")`),
    "shippingId",
  );
  await key(cdp, " ", "Space");
  await key(cdp, "Tab");
  assert.equal(
    await cdp.evaluate(`document.activeElement?.id`),
    "checkout-delivery-apply",
  );
  const focus = await cdp.evaluate(`(()=>{
    const style=getComputedStyle(document.activeElement);
    return {outlineStyle:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
  })()`);
  assert.notEqual(focus.outlineStyle, "none");
  assert.ok(focus.outlineWidth >= 2);
  await key(cdp, "Enter");
  return initialVersion;
}

async function fillDelivery(cdp) {
  const initialVersion = await cdp.evaluate(
    `Number(globalThis.__checkoutRoot().querySelector('input[name="cartVersion"]')?.value)`,
  );
  const values = {
    email: "ada@example.test",
    firstName: "Ada",
    lastName: "Yılmaz",
    phone: "+905551112233",
    line1: "Bağdat Caddesi 1",
    line2: "Kat 2",
    city: "İstanbul",
    district: "Kadıköy",
    postalCode: "34710",
  };
  for (const [name, value] of Object.entries(values)) {
    await setInput(cdp, `input[name="${name}"]`, value);
  }
  await click(cdp, `input[name="shippingId"][value="standard"]`);
  await click(cdp, "#checkout-delivery-apply");
  return initialVersion;
}

async function waitDelivery(cdp, initialVersion) {
  await waitFor(
    cdp,
    `Number(globalThis.__checkoutRoot().querySelector('input[name="cartVersion"]')?.value)>${JSON.stringify(initialVersion)}&&globalThis.__checkoutRoot().querySelector("#checkout-delivery-apply")?.textContent==="Bilgileri uygula"&&globalThis.__checkoutRoot().querySelector("#checkout-error")===null`,
    "delivery_applied",
    10_000,
  );
}

async function desktopContract(cdp) {
  const desktop = await cdp.evaluate(`(() => {
    const text = (node) => node?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
    const roots = [...document.querySelectorAll("[data-checkout-root]")];
    const root = roots.sort((left,right) =>
      right.getBoundingClientRect().width-left.getBoundingClientRect().width)[0];
    const main = root.querySelector("main");
    const asides = [...root.querySelectorAll('aside[aria-label="Sipariş özeti"]')];
    const aside = asides.sort((left,right) =>
      right.getBoundingClientRect().width-left.getBoundingClientRect().width)[0];
    const mainStyle = getComputedStyle(main);
    const grid = root.querySelector(":scope>div");
    return {
      asideCount: asides.length,
      asideDisplays: asides.map(node=>getComputedStyle(node).display),
      asideWidths: asides.map(node=>Math.round(node.getBoundingClientRect().width)),
      gridDisplay: getComputedStyle(grid).display,
      gridColumns: getComputedStyle(grid).gridTemplateColumns,
      mainClass: main.className,
      mainMaxWidth: mainStyle.maxWidth,
      mainPadding: mainStyle.padding,
      mainWidth: Math.round(main.getBoundingClientRect().width),
      summaryWidth: aside ? Math.round(aside.getBoundingClientRect().width) : -1,
      headings: [...document.querySelectorAll("h1,h2")].map(text),
      overflow: document.documentElement.scrollWidth-innerWidth,
      rootCount: roots.length,
      rootWidths: roots.map(node=>Math.round(node.getBoundingClientRect().width)),
      stylesheets: [...document.styleSheets].map(sheet=>sheet.href??"inline"),
    };
  })()`);
  assert.equal(desktop.mainWidth, 499, JSON.stringify(desktop));
  assert.equal(desktop.summaryWidth, 400, JSON.stringify(desktop));
  for (const heading of ["İletişim", "Teslimat", "Kargo yöntemi", "Ödeme"]) {
    assert.equal(desktop.headings.includes(heading), true);
  }
  assert.equal(desktop.overflow, 0);
  return desktop;
}

async function paritySnapshot(cdp) {
  return cdp.evaluate(`(async()=>{
    const root=[...document.querySelectorAll("[data-checkout-root]")]
      .sort((left,right)=>right.getBoundingClientRect().width-left.getBoundingClientRect().width)[0];
    const css=await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')]
      .map(async(link)=>new Uint8Array(await fetch(link.href).then(response=>response.arrayBuffer()))));
    const size=css.reduce((sum,value)=>sum+value.byteLength,0);
    const joined=new Uint8Array(size);
    let offset=0;for(const value of css){joined.set(value,offset);offset+=value.byteLength}
    const cssDigest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",joined))]
      .map(value=>value.toString(16).padStart(2,"0")).join("");
    const parityNodes=[...root.querySelectorAll("*")].filter(node=>
      node.getAttribute("name")!=="identityNumber"
      && !node.matches(".checkout-identity")
      && node.closest(".checkout-identity")===null
    );
    const structure=parityNodes.map(node=>{
      const ariaLabel=node.getAttribute("aria-label");
      return [
        node.tagName,
        [...node.classList].sort(),
        node.getAttribute("name"),
        node.getAttribute("type"),
        node.getAttribute("role"),
        /^\\d+ adet$/.test(ariaLabel??"")?"<quantity>":ariaLabel,
      ];
    });
    const structureDigest=[...new Uint8Array(await crypto.subtle.digest(
      "SHA-256",new TextEncoder().encode(JSON.stringify(structure))
    ))].map(value=>value.toString(16).padStart(2,"0")).join("");
    const main=root.querySelector("main");
    const summary=[...root.querySelectorAll('aside[aria-label="Sipariş özeti"]')]
      .sort((left,right)=>right.getBoundingClientRect().width-left.getBoundingClientRect().width)[0];
    const mainStyle=getComputedStyle(main),summaryStyle=getComputedStyle(summary);
    return {
      cssDigest,
      fieldOrder:[...root.querySelectorAll("form input,form button")]
        .filter(node=>node.getAttribute("name")!=="identityNumber")
        .map(node=>node.getAttribute("name")??node.id??node.getAttribute("type")),
      rootClasses:[...root.classList].sort(),
      sectionOrder:[...main.querySelectorAll("h2")].map(node=>node.textContent.trim()),
      structureDigest,
      tokens:{
        fontFamily:mainStyle.fontFamily,
        mainBackground:mainStyle.backgroundColor,
        mainWidth:Math.round(main.getBoundingClientRect().width),
        summaryBackground:summaryStyle.backgroundColor,
        summaryWidth:Math.round(summary.getBoundingClientRect().width),
      },
    };
  })()`);
}

async function methodSelections(cdp, host) {
  const results = [];
  for (const [kind, methodId] of Object.entries(host.methodIds)) {
    await click(cdp, `input[name="paymentMethodId"][value="${methodId}"]`);
    const selected = await cdp.evaluate(`(()=>{
      const input=globalThis.__checkoutRoot().querySelector('input[name="paymentMethodId"][value="${methodId}"]');
      const details=input?.closest("label")?.nextElementSibling;
      return {checked:input?.checked===true,details:details?.textContent?.replace(/\\s+/g," ").trim()??""};
    })()`);
    assert.equal(selected.checked, true, `${host.hostname} ${kind}`);
    assert.ok(selected.details.length > 0, `${host.hostname} ${kind} details`);
    if (kind === "provider" && host.hostname.startsWith("store-b")) {
      assert.equal(
        await cdp.evaluate(`globalThis.__checkoutRoot().querySelectorAll('#checkout-identity-number').length`),
        1,
      );
    }
    results.push({ kind, ...selected });
  }
  return results;
}

async function applyDiscount(cdp, value, expected) {
  const selector = `.checkout-summary-desktop input[id^="discount-code"]`;
  await setInput(cdp, selector, value);
  await click(cdp, `.checkout-summary-desktop .checkout-discount button`);
  if (expected === "invalid") {
    await waitFor(
      cdp,
      `globalThis.__checkoutRoot().querySelector("#checkout-error")?.textContent==="İndirim kodu geçerli değil."`,
      "discount_invalid",
    );
    return;
  }
  await waitFor(
    cdp,
    `globalThis.__checkoutRoot().querySelector("#checkout-error")===null&&[...globalThis.__checkoutRoot().querySelectorAll(".checkout-totals dt")].some(node=>node.textContent==="İndirim")`,
    "discount_valid",
  );
}

async function axe(cdp) {
  await cdp.evaluate(`${readFileSync(AXE, "utf8")}\ntrue`);
  const result = await cdp.evaluate(`(async()=>{
    const result=await axe.run(document,{resultTypes:["violations"],runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}});
    return result.violations.filter(item=>item.impact==="critical"||item.impact==="serious")
      .map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>node.target)}));
  })()`);
  assert.deepEqual(result, []);
  return result;
}

async function mobileContract(cdp) {
  const result = await cdp.evaluate(`(()=>{
    const visible=node=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=="hidden";
    const root=globalThis.__checkoutRoot();
    const toggle=[...root.querySelectorAll('button[aria-expanded]')].filter(visible);
    const controls=[...root.querySelectorAll("input,button")].filter(visible).map(node=>{
      const rect=node.getBoundingClientRect();
      return {name:node.getAttribute("name")??node.textContent?.trim().slice(0,40),width:rect.width,height:rect.height};
    });
    return {
      asideVisible:[...root.querySelectorAll('aside[aria-label="Sipariş özeti"]')].some(visible),
      controls,
      expanded:toggle[0]?.getAttribute("aria-expanded"),
      overflow:document.documentElement.scrollWidth-innerWidth,
      toggleCount:toggle.length,
    };
  })()`);
  assert.equal(result.asideVisible, false);
  assert.equal(result.toggleCount, 1);
  assert.equal(result.expanded, "false");
  assert.equal(result.overflow, 0);
  assert.deepEqual(
    result.controls.filter(({ height }) => height < 44),
    [],
    `mobile controls below 44px: ${JSON.stringify(result.controls)}`,
  );
  await click(cdp, `button[aria-expanded]`);
  assert.equal(
    await cdp.evaluate(`globalThis.__checkoutRoot().querySelector('button[aria-expanded]')?.getAttribute("aria-expanded")`),
    "true",
  );
  return result;
}

async function reducedMotion(cdp) {
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  const result = await cdp.evaluate(`(()=>{
    const root=[...document.querySelectorAll("[data-checkout-root]")]
      .sort((left,right)=>right.getBoundingClientRect().width-left.getBoundingClientRect().width)[0];
    const values=[...root.querySelectorAll("*")].flatMap(node=>{
      const style=getComputedStyle(node);
      return [...style.transitionDuration.split(","),...style.animationDuration.split(",")].map(value=>value.trim());
    });
    const milliseconds=values.map(value=>value.endsWith("ms")?parseFloat(value):parseFloat(value)*1000)
      .filter(Number.isFinite);
    return {maximum:Math.max(0,...milliseconds),matches:matchMedia("(prefers-reduced-motion: reduce)").matches};
  })()`);
  assert.equal(result.matches, true);
  assert.ok(result.maximum <= 0.011, JSON.stringify(result));
  return result;
}

async function zoomContract(cdp, host) {
  await viewport(cdp, 640, 450, 2);
  await navigate(cdp, host);
  await checkoutReady(cdp, host);
  const result = await cdp.evaluate(`({
    overflow:document.documentElement.scrollWidth-innerWidth,
    scale:window.devicePixelRatio,
    width:innerWidth,
  })`);
  assert.equal(result.overflow, 0);
  assert.equal(result.scale, 2);
  return result;
}

async function maskAndScreenshot(cdp, fixture, spec) {
  await viewport(cdp, spec.width, spec.height);
  const host = fixture.hosts[spec.host];
  await navigate(cdp, host);
  await checkoutReady(cdp, host);
  await cdp.evaluate(`(()=>{
    const style=document.createElement("style");
    style.id="checkout-stable-mask";
    style.textContent=[
      ".checkout-wordmark{color:transparent!important}",
      ".checkout-item-copy strong,.checkout-item-copy small{color:transparent!important}",
      ".checkout-item-image img{visibility:hidden!important}",
      ".checkout-result-order strong{color:transparent!important}",
    ].join("");
    document.head.append(style);
    return true;
  })()`);
  const { data } = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true,
  });
  const target = path.join(fixture.artifacts, spec.name);
  writeFileSync(target, Buffer.from(data, "base64"));
  await cdp.evaluate(`document.querySelector("#checkout-stable-mask")?.remove()`);
  const png = readFileSync(target);
  assert.ok(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), spec.name);
  assert.equal(png.readUInt32BE(16), spec.width, `${spec.name} width`);
  assert.equal(png.readUInt32BE(20), spec.height, `${spec.name} height`);
  return target;
}

async function fakeProviderOutcomes(cdp, fixture, host) {
  const outcomes = [];
  for (const outcome of ["redirect", "processing", "rejected"]) {
    fixture.setProviderOutcome(outcome);
    const result = await cdp.evaluate(`fetch("/api/checkout/submit",{
      method:"POST",
      credentials:"same-origin",
      headers:{"accept":"application/json","content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({paymentMethodId:${JSON.stringify(host.methodIds.provider)}})
    }).then(async response=>({status:response.status,body:await response.json()}))`);
    if (outcome === "redirect") {
      assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.body).sort(), ["kind", "location"]);
      assert.equal(result.body.kind, "redirect");
      assert.match(result.body.location, /^https:\/\/sandbox-cpp[.]iyzipay[.]com[?]/);
    } else if (outcome === "processing") {
      assert.deepEqual(result, { status: 202, body: { code: "processing" } });
    } else {
      assert.deepEqual(result, { status: 409, body: { code: "payment_unavailable" } });
    }
    outcomes.push({ outcome, ...result });
  }
  fixture.setProviderOutcome("passthrough");
  return outcomes;
}

async function browserDuplicateGuard(cdp, fixture, host) {
  fixture.setProviderOutcome("processing");
  await cdp.evaluate(`(()=>{
    const active=globalThis.__checkoutRoot();
    const stale=active.cloneNode(true);
    stale.setAttribute("data-checkout-stale-root","");
    stale.style.display="none";
    for(const input of stale.querySelectorAll('#checkout-delivery-form input:not([type="radio"])')){
      input.value="";
    }
    active.before(stale);
    return true;
  })()`);
  await click(cdp, `input[name="paymentMethodId"][value="${host.methodIds.provider}"]`);
  if (host.hostname.startsWith("store-b")) {
    await setInput(cdp, "#checkout-identity-number", "74300864791");
  }
  await click(cdp, `input[name="distanceSales"]`);
  await click(cdp, `input[name="preInformation"]`);
  const requestCount = { value: 0 };
  const release = cdp.on("Network.requestWillBeSent", ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/api/checkout/submit")) {
      requestCount.value += 1;
    }
  });
  await setInput(cdp, `input[name="line2"]`, "Kat 3");
  await click(cdp, `.checkout-submit`);
  await waitFor(
    cdp,
    `globalThis.__checkoutRoot().querySelector("#checkout-delivery-apply-error")!==null&&document.activeElement===globalThis.__checkoutRoot().querySelector("#checkout-delivery-apply")`,
    "active_delivery_dirty_blocked",
  );
  assert.equal(requestCount.value, 0);
  await setInput(cdp, `input[name="line2"]`, "Kat 2");
  const deliveryVersion = await cdp.evaluate(
    `Number(globalThis.__checkoutRoot().querySelector('input[name="cartVersion"]')?.value)`,
  );
  await click(cdp, "#checkout-delivery-apply");
  await waitDelivery(cdp, deliveryVersion);
  await click(cdp, `.checkout-submit`);
  await waitFor(cdp, `globalThis.__checkoutRoot().querySelector(".checkout-submit")?.disabled===true`, "submit_disabled");
  await click(cdp, `.checkout-submit`);
  await waitFor(
    cdp,
    `globalThis.__checkoutRoot().querySelector("#checkout-error")?.textContent?.includes("doğrulanıyor")===true`,
    "submit_processing",
  );
  release();
  await cdp.evaluate(`document.querySelector('[data-checkout-stale-root]')?.remove()`);
  fixture.setProviderOutcome("passthrough");
  assert.equal(requestCount.value, 1);
  return requestCount.value;
}

async function consentEnforcement(cdp, host) {
  await click(cdp, `input[name="paymentMethodId"][value="${host.methodIds.bankTransfer}"]`);
  await click(cdp, `.checkout-submit`);
  await waitFor(
    cdp,
    `document.activeElement?.getAttribute("name")==="distanceSales"&&globalThis.__checkoutRoot().querySelector("#checkout-distanceSales-error")!==null`,
    "consent_enforced",
  );
  return true;
}

async function serverIdempotency(cdp, fixture, host) {
  await click(cdp, `input[name="distanceSales"]`);
  await click(cdp, `input[name="preInformation"]`);
  const result = await cdp.evaluate(`(async()=>{
    const form=globalThis.__checkoutRoot().querySelector(".checkout-payment-section form");
    const body=new URLSearchParams(new FormData(form));
    const submit=()=>fetch("/api/checkout/submit",{
      method:"POST",credentials:"same-origin",
      headers:{"accept":"application/json","content-type":"application/x-www-form-urlencoded"},
      body:body.toString(),
    }).then(async response=>({status:response.status,body:await response.json()}));
    return await Promise.all([submit(),submit()]);
  })()`);
  assert.deepEqual(result.map(({ status }) => status), [200, 200]);
  assert.deepEqual(result.map(({ body }) => body.kind), ["redirect", "redirect"]);
  const count = fixture.database.query(
    `SELECT count(*) FROM saas.orders WHERE store_id='${host.storeId}' AND storefront_cart_id='${host.cartId}';`,
  );
  assert.equal(count, "1");
  return result;
}

async function resultStates(cdp, fixture, host) {
  const checks = [
    ["placed", null, "Siparişiniz alındı"],
    ["processing", "processing", "Ödemeniz doğrulanıyor"],
    ["failed", "failed", "Ödeme tamamlanamadı"],
    ["paid", "completed", "Ödemeniz onaylandı"],
  ];
  const seen = [];
  for (const [kind, paymentStatus, heading] of checks) {
    if (paymentStatus !== null) {
      fixture.database.query(`SET ROLE celebix_saas_owner;
        UPDATE saas.orders SET payment_status='${paymentStatus}',updated_at='${NOW}'
        WHERE store_id='${host.storeId}' AND storefront_cart_id='${host.cartId}';`);
    }
    await navigate(cdp, host, "/odeme/sonuc");
    await waitFor(
      cdp,
      `document.querySelector("h1")?.textContent===${JSON.stringify(heading)}`,
      `result_${kind}`,
    );
    const claims = await cdp.evaluate(`({
      heading:document.querySelector("h1")?.textContent,
      orderNumber:document.querySelector(".checkout-result-order strong")?.textContent,
    })`);
    assert.match(claims.orderNumber, /^SF-/);
    seen.push({ kind, ...claims });
  }
  return seen;
}

function validateScreenshots(paths) {
  assert.deepEqual(paths.map((value) => path.basename(value)), SCREENSHOTS.map(({ name }) => name));
  for (const value of paths) {
    const bytes = readFileSync(value);
    assert.ok(bytes.byteLength > 10_000, `${path.basename(value)} rendered PNG`);
  }
}

async function main() {
  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("LOCAL_CHROME_REQUIRED");
  const fixture = await startCheckoutBrowserFixture();
  const debugPort = await freePort();
  const profile = mkdtempSync(path.join(tmpdir(), "celebix-checkout-cdp-"));
  const browser = spawn(chrome, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--ignore-certificate-errors",
    "--no-default-browser-check",
    "--no-first-run",
    `--host-resolver-rules=${fixture.hostResolverRules}`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });
  let cdp;
  const checkoutTraffic = [];
  const requestExtraInfo = new Map();
  try {
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, "chrome");
    const target = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
      { method: "PUT" },
    ).then((response) => response.json());
    cdp = new Cdp(target.webSocketDebuggerUrl);
    const consoleErrors = [];
    const exceptions = [];
    const failedRequests = [];
    const cspViolations = [];
    cdp.on("Runtime.consoleAPICalled", ({ args, type }) => {
      if (["error", "assert"].includes(type)) {
        consoleErrors.push(args.map(({ description, value }) => value ?? description).join(" "));
      }
    });
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
    });
    cdp.on("Network.loadingFailed", ({ canceled, errorText, type }) => {
      if (!canceled && type !== "Ping") failedRequests.push({ errorText, type });
    });
    cdp.on("Network.requestWillBeSent", ({ request, requestId }) => {
      if (new URL(request.url).pathname.startsWith("/api/checkout/")) {
        const normalizedHeaders = Object.fromEntries(
          Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
        );
        const traffic = {
          headers: Object.fromEntries(Object.entries(normalizedHeaders)
            .filter(([name]) => [
              "content-length",
              "content-type",
              "cookie",
              "host",
              "origin",
              "transfer-encoding",
            ].includes(name))),
          method: request.method,
          pathname: new URL(request.url).pathname,
          postData: request.postData ?? null,
          requestId,
        };
        if (requestExtraInfo.has(requestId)) {
          Object.assign(traffic, requestExtraInfo.get(requestId));
        }
        checkoutTraffic.push(traffic);
      }
    });
    cdp.on("Network.requestWillBeSentExtraInfo", ({ associatedCookies, headers, requestId }) => {
      const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
      );
      const cookieNames = String(normalizedHeaders.cookie ?? "")
        .split(";")
        .map((segment) => segment.split("=", 1)[0].trim())
        .filter(Boolean);
      const extra = {
        associatedCookieNames: (associatedCookies ?? [])
          .map(({ cookie }) => cookie?.name)
          .filter(Boolean),
        cookieNames,
        extraHeaders: Object.fromEntries(Object.entries(normalizedHeaders)
          .filter(([name]) => [
            "content-length",
            "content-type",
            "host",
            "origin",
            "sec-fetch-mode",
            "sec-fetch-site",
            "transfer-encoding",
          ].includes(name))),
      };
      requestExtraInfo.set(requestId, extra);
      const selected = checkoutTraffic.find((entry) => entry.requestId === requestId);
      if (selected) Object.assign(selected, extra);
    });
    cdp.on("Network.responseReceived", ({ requestId, response }) => {
      const selected = checkoutTraffic.find((entry) => entry.requestId === requestId);
      if (selected) selected.status = response.status;
    });
    cdp.on("Network.loadingFinished", ({ requestId }) => {
      const selected = checkoutTraffic.find((entry) => entry.requestId === requestId);
      if (!selected) return;
      void cdp.send("Network.getResponseBody", { requestId }).then(({ body, base64Encoded }) => {
        selected.responseBody = base64Encoded
          ? Buffer.from(body, "base64").toString("utf8")
          : body;
      }).catch((error) => {
        selected.responseBodyError = String(error);
      });
    });
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
      cdp.send("Log.enable"),
    ]);
    await cdp.send("Page.bringToFront");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `globalThis.__checkoutCspViolations=[];
globalThis.__checkoutRoot=()=>[...document.querySelectorAll("[data-checkout-root]")]
  .sort((left,right)=>right.getBoundingClientRect().width-left.getBoundingClientRect().width)[0]??null;
addEventListener("securitypolicyviolation",event=>globalThis.__checkoutCspViolations.push({
  blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective
}));`,
    });
    for (const host of fixture.hosts) await setCartCookie(cdp, host);

    const parity = [];
    const desktop = [];
    const methods = [];
    const accessibility = [];
    const screenshots = [];
    const providerOutcomes = [];
    const shipping = [];

    for (const [index, host] of fixture.hosts.entries()) {
      await viewport(cdp, 1280, 900);
      await navigate(cdp, host);
      await checkoutReady(cdp, host);
      desktop.push(await desktopContract(cdp));
      parity.push(await paritySnapshot(cdp));
      methods.push({ hostname: host.hostname, selections: await methodSelections(cdp, host) });
      accessibility.push({ hostname: host.hostname, desktop: await axe(cdp) });
      for (const spec of SCREENSHOTS.filter(({ host: selected }) => selected === index)) {
        screenshots.push(await maskAndScreenshot(cdp, fixture, spec));
      }
      await viewport(cdp, 1280, 900);
      await navigate(cdp, host);
      await checkoutReady(cdp, host);

      await click(cdp, "#checkout-delivery-apply");
      await waitFor(
        cdp,
        `document.activeElement?.getAttribute("name")==="email"&&globalThis.__checkoutRoot().querySelector("#checkout-email-error")!==null`,
        `delivery_focus_${host.hostname}`,
      );
      const initialDeliveryVersion = index === 0
        ? await fillDelivery(cdp)
        : await keyboardDelivery(cdp);
      await waitDelivery(cdp, initialDeliveryVersion);
      const shippingText = await cdp.evaluate(`(()=>{
        const rows=[...globalThis.__checkoutRoot().querySelectorAll(".checkout-totals>div")];
        return rows.find(row=>row.querySelector("dt")?.textContent==="Kargo")?.querySelector("dd")?.textContent;
      })()`);
      shipping.push({ hostname: host.hostname, text: shippingText });
      if (index === 0) {
        await applyDiscount(cdp, "GECERSIZ", "invalid");
        await applyDiscount(cdp, "ATOLYE10", "valid");
        await consentEnforcement(cdp, host);
      } else {
        providerOutcomes.push(...await fakeProviderOutcomes(cdp, fixture, host));
        assert.equal(await browserDuplicateGuard(cdp, fixture, host), 1);
      }

      await viewport(cdp, 390, 844);
      await navigate(cdp, host);
      await checkoutReady(cdp, host);
      const mobile = await mobileContract(cdp);
      accessibility.at(-1).mobile = await axe(cdp);
      accessibility.at(-1).mobileContract = mobile;
      accessibility.at(-1).reducedMotion = await reducedMotion(cdp);
      cspViolations.push(...await cdp.evaluate(`globalThis.__checkoutCspViolations??[]`));
      if (index === 0) {
        await viewport(cdp, 1280, 900);
        await navigate(cdp, host);
        await checkoutReady(cdp, host);
        const initialDeliveryVersion = await fillDelivery(cdp);
        await waitDelivery(cdp, initialDeliveryVersion);
        await consentEnforcement(cdp, host);
        const replay = await serverIdempotency(cdp, fixture, host);
        assert.equal(replay.length, 2);
        const states = await resultStates(cdp, fixture, host);
        assert.deepEqual(states.map(({ kind }) => kind), ["placed", "processing", "failed", "paid"]);
      }
    }

    assert.equal(shipping[0].text, "0,00 TRY", JSON.stringify(shipping));
    assert.notEqual(shipping[1].text, "0,00 TRY", JSON.stringify(shipping));
    assert.deepEqual(parity[0], parity[1], "fixed checkout DOM/CSS/layout contract changed with theme");
    assert.equal(new Set(parity.map(({ cssDigest }) => cssDigest)).size, 1);
    assert.equal(new Set(parity.map(({ structureDigest }) => structureDigest)).size, 1);
    const zoom = await zoomContract(cdp, fixture.hosts[1]);

    validateScreenshots(screenshots);

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(exceptions, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(cspViolations, []);

    const result = Object.freeze({
      accessibility,
      consoleErrors: consoleErrors.length,
      cspViolations: cspViolations.length,
      desktop,
      exceptions: exceptions.length,
      failedRequests: failedRequests.length,
      methods,
      parity,
      providerOutcomes,
      screenshots,
      shipping,
      zoom,
    });
    writeFileSync(
      path.join(fixture.artifacts, "browser-acceptance.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    process.stdout.write(
      `PASS storefront fixed one-page browser acceptance\n${JSON.stringify(result, null, 2)}\n`,
    );
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.stack : String(error)}\nCHECKOUT_TRAFFIC\n${JSON.stringify(checkoutTraffic, null, 2)}\nFIXTURE_REQUEST_LOG\n${JSON.stringify(fixture.requestLog(), null, 2)}\nNEXT_LOG\n${fixture.nextLog()}`,
    );
  } finally {
    await cdp?.close();
    await Promise.all([stopProcess(browser), fixture.stop()]);
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
