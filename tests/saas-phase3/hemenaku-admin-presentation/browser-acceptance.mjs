import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const FIXTURE = path.join(ROOT, "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture");
const ARTIFACTS = path.join(ROOT, ".codex-artifacts/hemenaku-admin-full-parity");
const CDP_COMMAND_TIMEOUT = 15_000;
const MAX_NEXT_LOG_BYTES = 16_000;
const MIN_TABLE_CELL_CONTENT_WIDTH = 40;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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
const TARGET_ROUTE_ASSERTIONS = Object.freeze({
  "/": "Sipariş özeti",
  "/analytics": "Gelir zaman serisi",
  "/orders/ORDER_ID/print": "Sipariş #HMK-1042",
  "/customers/CUSTOMER_ID/edit": "Müşteriyi Düzenle",
  "/products/extras/RESOURCE_ID/preview": "Hediye paketi",
  "/products/purchasing": "Kalıcı Tedarikçi",
  "/products/inventory-counts": "Sayım 88888888",
  "/products/transfers": "TR-99999999",
  "/products/price-lists": "Perakende TRY",
  "/seo/products": "Keten Gömlek SEO",
  "/products/shopify-converter": "CSV dosyası",
  "/products": "Keten Gömlek",
  "/settings": "Ana mağaza profili",
});
const SCREENSHOTS = Object.freeze([
  Object.freeze({ name: "dashboard-desktop-1440x900.png", width: 1440, height: 900 }),
  Object.freeze({ name: "analytics-desktop-1280x800.png", width: 1280, height: 800 }),
  Object.freeze({ name: "orders-print-desktop-1280x800.png", width: 1280, height: 800 }),
  Object.freeze({ name: "catalog-editor-desktop-1280x800.png", width: 1280, height: 800 }),
  Object.freeze({ name: "settings-desktop-1280x800.png", width: 1280, height: 800 }),
  Object.freeze({ name: "seo-desktop-1280x800.png", width: 1280, height: 800 }),
  Object.freeze({ name: "boundary-desktop-1025x768.png", width: 1025, height: 768 }),
  Object.freeze({ name: "boundary-mobile-1024x768.png", width: 1024, height: 768 }),
  Object.freeze({ name: "dashboard-mobile-390x844.png", width: 390, height: 844 }),
  Object.freeze({ name: "drawer-mobile-390x844.png", width: 390, height: 844 }),
  Object.freeze({ name: "products-mobile-390x844.png", width: 390, height: 844 }),
  Object.freeze({ name: "inventory-count-mobile-390x844.png", width: 390, height: 844 }),
  Object.freeze({ name: "price-lists-mobile-390x844.png", width: 390, height: 844 }),
  Object.freeze({ name: "dashboard-mobile-320x720.png", width: 320, height: 720 }),
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
      this.readyTimer = setTimeout(() => reject(new Error("cdp_socket_open_timeout")), CDP_COMMAND_TIMEOUT);
      this.socket.addEventListener("open", () => {
        clearTimeout(this.readyTimer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(this.readyTimer);
        reject(new Error("cdp_socket_open_error"));
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
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
    this.socket.addEventListener("error", () => this.rejectPending(new Error("cdp_socket_error")));
    this.socket.addEventListener("close", () => this.rejectPending(new Error("cdp_socket_closed")));
  }
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }
  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
  async send(method, params = {}, timeout = CDP_COMMAND_TIMEOUT) {
    await this.ready;
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error(`cdp_socket_not_open:${method}`);
    const id = ++this.nextId;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}_timeout`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
    });
    try {
      this.socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) clearTimeout(pending.timer);
      this.pending.delete(id);
      throw error;
    }
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
  async close() {
    clearTimeout(this.readyTimer);
    this.listeners.clear();
    this.rejectPending(new Error("cdp_closed"));
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.socket.removeEventListener("open", closeSocket);
        this.socket.removeEventListener("close", finish);
        this.socket.removeEventListener("error", finish);
        resolve();
      };
      const closeSocket = () => {
        if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, "acceptance_complete");
      };
      const timer = setTimeout(finish, 1_000);
      this.socket.addEventListener("close", finish, { once: true });
      this.socket.addEventListener("error", finish, { once: true });
      if (this.socket.readyState === WebSocket.CONNECTING) this.socket.addEventListener("open", closeSocket, { once: true });
      else closeSocket();
    });
  }
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
  const pathname = route.split("?", 1)[0];
  const event = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: `${origin}${route}` });
  await event;
  await waitFor(cdp, `location.pathname===${JSON.stringify(pathname)}`, `route_${route}`);
  if (loaded) {
    await waitFor(cdp, `document.querySelector('[data-target-route=${JSON.stringify(pathname)}]')!==null`, `target_${route}`);
    const expected = TARGET_ROUTE_ASSERTIONS[pathname];
    if (expected) await waitFor(cdp, `document.querySelector('[data-target-route=${JSON.stringify(pathname)}]')?.innerText.includes(${JSON.stringify(expected)})===true`, `loaded_${route}`);
  }
}

async function screenshot(cdp, index) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const target = path.join(ARTIFACTS, SCREENSHOTS[index].name);
  writeFileSync(target, Buffer.from(data, "base64"));
  return target;
}

async function elementPoint(cdp, expression, label) {
  const point = await cdp.evaluate(`(() => {
    const target=(${expression});
    if(!target||!target.getClientRects().length)return null;
    target.scrollIntoView({block:'center',inline:'center'});
    const rect=target.getBoundingClientRect();
    return {x:rect.left+(rect.width/2),y:rect.top+(rect.height/2)};
  })()`);
  assert.ok(point, `missing interactive target: ${label}`);
  return point;
}

async function dispatchPointerClick(cdp, expression, label) {
  const point = await elementPoint(cdp, expression, label);
  await dispatchPointerAt(cdp, point);
}

async function dispatchPointerAt(cdp, point) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}

async function clickByText(cdp, targetText) {
  const text = JSON.stringify(targetText);
  await dispatchPointerClick(cdp, `(() => {
    const label=${text};
    return [...document.querySelectorAll('button,a')].find((entry)=>(entry.textContent?.includes(label)||entry.getAttribute('aria-label')===label)&&entry.getClientRects().length)??null;
  })()`, targetText);
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
    const dimensions=targets.map((entry)=>{
      const hitTarget=entry.matches('input[type="checkbox"],input[type="radio"]')?entry.closest('label')??entry:entry;
      const rect=hitTarget.getBoundingClientRect();
      return {label:entry.getAttribute('aria-label')||entry.textContent?.trim().slice(0,60)||entry.tagName,width:rect.width,height:rect.height};
    });
    const parse=(color)=>{const values=color.match(/[\\d.]+/g)?.slice(0,3).map(Number);return values?.length===3?values:[0,0,0];};
    const luminance=(color)=>parse(color).map((part)=>part/255).map((part)=>part<=.03928?part/12.92:Math.pow((part+.055)/1.055,2.4)).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0);
    const targetPrimaryActions=[...document.querySelectorAll('[class*="primaryAction"]')].filter(visible).map((entry)=>{
      const style=getComputedStyle(entry),rect=entry.getBoundingClientRect(),foreground=luminance(style.color),background=luminance(style.backgroundColor);
      return {
        tagName:entry.tagName,
        className:entry.className,
        width:rect.width,
        height:rect.height,
        minHeight:style.minHeight,
        color:style.color,
        backgroundColor:style.backgroundColor,
        contrast:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05),
      };
    });
    const targetPrimaryAction=targetPrimaryActions[0]??null;
    return {
      width:innerWidth,
      height:innerHeight,
      horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
      minimumTarget:dimensions.length?Math.min(...dimensions.map(({width,height})=>Math.min(width,height))):0,
      undersized:dimensions.filter(({width,height})=>width<48||height<48),
      primaryContrast:targetPrimaryActions.length?Math.min(...targetPrimaryActions.map(({contrast})=>contrast)):null,
      targetPrimaryAction,
    };
  })()`);
  assert.equal(value.horizontalOverflow, 0, `${label} horizontal overflow`);
  assert.deepEqual(value.undersized, [], `${label} has targets smaller than 48px`);
  assert.ok(value.minimumTarget >= 48, `${label} minimum target ${value.minimumTarget}`);
  if (value.targetPrimaryAction) {
    assert.ok(value.targetPrimaryAction.width >= 48 && value.targetPrimaryAction.height >= 48, `${label} target action dimensions`);
    assert.ok(value.primaryContrast >= 4.5, `${label} primary orange contrast ${value.primaryContrast}`);
  }
  return Object.freeze({ label, ...value });
}

async function measureFiveColumnTable(cdp, label) {
  const value = await cdp.evaluate(`(() => {
    const table=[...document.querySelectorAll('[data-target-route] table')].find((entry)=>getComputedStyle(entry).display!=='none');
    if(!table)return null;
    const inspect=(entry)=>{
      const rect=entry.getBoundingClientRect(),style=getComputedStyle(entry);
      const contentWidth=rect.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      return {text:entry.textContent?.trim()??'',width:rect.width,height:rect.height,contentWidth};
    };
    return {
      width:innerWidth,
      documentOverflow:document.documentElement.scrollWidth-innerWidth,
      headerCells:[...table.querySelectorAll('thead th')].map(inspect),
      bodyCells:[...table.querySelectorAll('tbody tr:first-child td')].map(inspect),
    };
  })()`);
  assert.ok(value, `${label} missing five-column table`);
  assert.equal(value.documentOverflow, 0, `${label} document overflow`);
  assert.equal(value.headerCells.length, 5, `${label} header count`);
  assert.equal(value.bodyCells.length, 5, `${label} body cell count`);
  for (const cell of [...value.headerCells, ...value.bodyCells]) {
    assert.ok(cell.width > 0 && cell.height > 0, `${label} collapsed cell: ${JSON.stringify(cell)}`);
    assert.ok(cell.contentWidth >= MIN_TABLE_CELL_CONTENT_WIDTH, `${label} unreadable cell: ${JSON.stringify(cell)}`);
  }
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
  await dispatchPointerClick(cdp, `document.querySelector('button[aria-label="Panel menüsünü aç"]')`, "Panel menüsünü aç");
  await waitFor(cdp, `document.querySelector('#panel-mobile-drawer')!==null`, "drawer_open");
  await waitFor(cdp, `(() => {const drawer=document.querySelector('#panel-mobile-drawer');if(!drawer)return false;const rect=drawer.getBoundingClientRect();return rect.right<=innerWidth+1&&rect.left<innerWidth-48;})()`, "drawer_settled");
}

async function dismissDrawerWithBackdrop(cdp) {
  const point = await cdp.evaluate(`(() => {
    const backdrop=document.querySelector('button[aria-label="Panel menüsünü kapat"]:not(#panel-mobile-drawer button)');
    const drawer=document.querySelector('#panel-mobile-drawer');
    if(!backdrop||!drawer)return null;
    const backdropRect=backdrop.getBoundingClientRect(),drawerRect=drawer.getBoundingClientRect();
    const x=Math.max(backdropRect.left+1,drawerRect.left/2),y=backdropRect.top+(backdropRect.height/2);
    return {x,y,hitAriaLabel:document.elementFromPoint(x,y)?.closest('button')?.getAttribute('aria-label')??null};
  })()`);
  assert.ok(point, "missing drawer backdrop point");
  assert.equal(point.hitAriaLabel, "Panel menüsünü kapat", JSON.stringify(point));
  await dispatchPointerAt(cdp, { x: point.x, y: point.y });
}

async function dismissDrawerWithSwipe(cdp) {
  const point = await elementPoint(cdp, `document.querySelector('#panel-mobile-drawer')`, "drawer swipe surface");
  const start = { x: point.x - 80, y: point.y };
  const end = { x: start.x + 100, y: start.y };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...start, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...end, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function measureTargetReducedMotion(cdp) {
  const targetReducedMotion = await cdp.evaluate(`(() => {
    const selectors={
      drawer:'#panel-mobile-drawer',
      backdrop:'[class*="drawerBackdrop"]',
      navigationLink:'#panel-mobile-drawer [class*="navigationLink"]',
      mobileDock:'nav[aria-label="Mobil panel menüsü"]',
      mobileDockLink:'nav[aria-label="Mobil panel menüsü"] a',
    };
    const targets=Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{
      const element=document.querySelector(selector);
      if(!element)return [name,null];
      const style=getComputedStyle(element);
      return [name,{selector,transitionDuration:style.transitionDuration,animationDuration:style.animationDuration}];
    }));
    return {matches:matchMedia('(prefers-reduced-motion: reduce)').matches,targets};
  })()`);
  assert.equal(targetReducedMotion.matches, true);
  const allowed = new Set(["0s", "0.00001s", "1e-05s"]);
  for (const [name, target] of Object.entries(targetReducedMotion.targets)) {
    assert.ok(target, `missing reduced-motion target ${name}`);
    const durations = [target.transitionDuration, target.animationDuration]
      .flatMap((entry) => entry.split(",").map((value) => value.trim()));
    assert.ok(durations.every((value) => allowed.has(value)), `${name}:${JSON.stringify(target)}`);
  }
  return targetReducedMotion;
}

async function assertDrawerClosedAndFocused(cdp, label) {
  try {
    await waitFor(cdp, `document.querySelector('#panel-mobile-drawer')===null&&document.activeElement?.getAttribute('aria-label')==='Panel menüsünü aç'`, `drawer_${label}_focusRestored`, 5_000);
  } catch (error) {
    const active = await cdp.evaluate(`(() => {const entry=document.activeElement;return {tagName:entry?.tagName,ariaLabel:entry?.getAttribute('aria-label'),text:entry?.textContent?.trim().slice(0,80),drawerPresent:document.querySelector('#panel-mobile-drawer')!==null};})()`);
    throw new Error(`${error instanceof Error ? error.message : String(error)}:${JSON.stringify(active)}`);
  }
  return true;
}

async function exerciseProviderFixture(cdp, origin) {
  const assertions = [{ pathname: "/marketplaces", state: "loaded", expected: "Trendyol Pilot Mağaza" }];
  await navigate(cdp, origin, "/marketplaces", false);
  await waitFor(cdp, `document.body.innerText.includes('Trendyol Pilot Mağaza')`, "provider_records");
  await clickByText(cdp, "Yeni kayıt");
  await waitFor(cdp, `document.querySelector('[role="dialog"][aria-modal="true"]')!==null`, "provider_editor");
  await pressEscape(cdp);
  await waitFor(cdp, `document.querySelector('[role="dialog"][aria-modal="true"]')===null`, "provider_editor_closed");
  assertions.push({ pathname: "/marketplaces", state: "editor_dismissed", expected: "dialog closed" });
  await clickByText(cdp, "Senkronizasyon hazırlığı oluştur");
  await waitFor(cdp, `document.body.innerText.includes('Sağlayıcı aktivasyonu bekleniyor')&&document.body.innerText.includes('Hazırlığı iptal et')`, "provider_prepare");
  assertions.push({ pathname: "/marketplaces", state: "provider_prepared", expected: "Sağlayıcı aktivasyonu bekleniyor" });
  await clickByText(cdp, "Hazırlığı iptal et");
  await waitFor(cdp, `document.body.innerText.includes('İptal edildi')`, "provider_cancel");
  assertions.push({ pathname: "/marketplaces", state: "provider_cancelled", expected: "İptal edildi" });
  return Object.freeze(assertions);
}

async function exerciseInventoryTruthStates(cdp, origin) {
  const matrix = Object.freeze({
    "/products/purchasing": Object.freeze({
      empty: "Satın alma kaydı yok",
      loading: "Satın alma kaydı yükleniyor",
      error: "Satın alma kaydı yüklenemedi",
      unavailable: "Satın alma hizmeti kullanılamıyor",
      denied: "Bu envanter listesini görüntüleme yetkiniz yok",
      conflict: "Satın alma kaydı başka bir işlemle çakıştı",
      replayed: "Satın alma işlemi daha önce tamamlandı",
      verification_unavailable: "Satın alma işlemi sonucu doğrulanamıyor",
    }),
    "/products/inventory-counts": Object.freeze({
      empty: "Stok sayımı yok",
      loading: "Stok sayımı yükleniyor",
      error: "Stok sayımı yüklenemedi",
      unavailable: "Stok sayımı hizmeti kullanılamıyor",
      denied: "Bu stok sayımını görüntüleme yetkiniz yok",
      conflict: "Stok sayımı başka bir işlemle çakıştı",
      replayed: "İşlem daha önce tamamlandı",
      verification_unavailable: "İşlem sonucu doğrulanamıyor",
    }),
    "/products/transfers": Object.freeze({
      empty: "Stok transferi yok",
      loading: "Stok transferi yükleniyor",
      error: "Stok transferi yüklenemedi",
      unavailable: "Stok transferi hizmeti kullanılamıyor",
      denied: "Bu envanter listesini görüntüleme yetkiniz yok",
      conflict: "Stok transferi başka bir işlemle çakıştı",
      replayed: "Transfer işlemi daha önce tamamlandı",
      verification_unavailable: "Transfer işlemi sonucu doğrulanamıyor",
    }),
  });
  const assertions = [];
  for (const [pathname, states] of Object.entries(matrix)) {
    await navigate(cdp, origin, pathname);
    assertions.push({ pathname, state: "loaded", expected: TARGET_ROUTE_ASSERTIONS[pathname] });
    for (const [state, expected] of Object.entries(states)) {
      const route = `${pathname}?state=${state}`;
      await navigate(cdp, origin, route, false);
      await waitFor(cdp, `document.querySelector('[data-target-state=${JSON.stringify(state)}]')?.innerText.includes(${JSON.stringify(expected)})===true`, `${pathname}_${state}`);
      assertions.push({ pathname, state, expected });
    }
  }
  await navigate(cdp, origin, "/products/inventory-counts");
  return Object.freeze(assertions);
}

async function exerciseOtherRouteStates(cdp, origin) {
  const matrix = Object.freeze({
    "/customers/CUSTOMER_ID/edit": Object.freeze({
      loaded: "Müşteriyi Düzenle",
      error: "Müşteri bilgileri yüklenemedi",
      unavailable: "Müşteri hizmeti şu anda kullanılamıyor",
      denied: "Bu müşteriyi düzenleme yetkiniz yok",
      conflict: "Bu müşteri sizden önce güncellendi",
    }),
    "/products/price-lists": Object.freeze({
      loaded: "Perakende TRY",
      empty: "Henüz fiyat listesi yok",
      error: "Fiyat listeleri yüklenemedi",
      unavailable: "Fiyatlandırma hizmeti kullanılamıyor",
      denied: "Bu fiyat listelerini görüntüleme yetkiniz yok",
      conflict: "Fiyat listesi başka bir işlemle çakıştı",
    }),
    "/products/shopify-converter": Object.freeze({
      loaded: "CSV dosyası",
      denied: "Bu işlem için katalog içe aktarma yetkiniz yok",
    }),
  });
  const assertions = [];
  for (const [pathname, states] of Object.entries(matrix)) {
    for (const [state, expected] of Object.entries(states)) {
      const route = state === "loaded" ? pathname : `${pathname}?state=${state}`;
      await navigate(cdp, origin, route, false);
      await waitFor(cdp, `document.querySelector('[data-target-state=${JSON.stringify(state)}]')?.innerText.includes(${JSON.stringify(expected)})===true`, `${pathname}_${state}`);
      assertions.push({ pathname, state, expected });
    }
  }
  return Object.freeze(assertions);
}

function isPermittedNetworkUrl(value) {
  if (value.startsWith("data:") || value.startsWith("blob:")) return true;
  try {
    const url = new URL(value);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return true;
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isBlockableExternalRequest(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !isPermittedNetworkUrl(value);
  } catch {
    return false;
  }
}

function appendBoundedLog(current, value) {
  return `${current}${String(value)}`.slice(-MAX_NEXT_LOG_BYTES);
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

function validateArtifacts() {
  const expectedArtifactFiles = [...SCREENSHOTS.map(({ name }) => name), "browser-acceptance.json"].sort();
  const artifactFiles = readdirSync(ARTIFACTS).sort();
  assert.equal(artifactFiles.length, 15, `expected exactly 15 acceptance artifacts: ${artifactFiles.join(",")}`);
  assert.deepEqual(artifactFiles, expectedArtifactFiles);

  for (const screenshotSpec of SCREENSHOTS) {
    const png = readFileSync(path.join(ARTIFACTS, screenshotSpec.name));
    assert.ok(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), `${screenshotSpec.name} PNG signature`);
    assert.equal(png.toString("ascii", 12, 16), "IHDR", `${screenshotSpec.name} first chunk`);
    assert.equal(png.readUInt32BE(16), screenshotSpec.width, `${screenshotSpec.name} width`);
    assert.equal(png.readUInt32BE(20), screenshotSpec.height, `${screenshotSpec.name} height`);
  }

  const parsedResult = JSON.parse(readFileSync(path.join(ARTIFACTS, "browser-acceptance.json"), "utf8"));
  assert.equal(parsedResult.screenshotCount, SCREENSHOTS.length);
  assert.equal(parsedResult.routeCount, REPRESENTATIVE_ROUTES.length);
  assert.equal(parsedResult.viewportCount, VIEWPORTS.length);
  assert.deepEqual(parsedResult.screenshots.map((entry) => path.basename(entry)).sort(), SCREENSHOTS.map(({ name }) => name).sort());
  assert.equal(parsedResult.consoleErrors, 0);
  assert.equal(parsedResult.runtimeExceptions, 0);
  assert.equal(parsedResult.externalRequests, 0);
  assert.equal(parsedResult.externalWebSocketAttempts, 0);
  assert.equal(parsedResult.blockedExternalRequests, 0);
  assert.equal(parsedResult.interceptionErrors, 0);
  assert.ok(parsedResult.measurements.minimumTarget >= 48);
  assert.ok(parsedResult.measurements.primaryContrast >= 4.5);
  assert.equal(parsedResult.measurements.horizontalOverflow, 0);
  assert.ok(parsedResult.measurements.viewportMeasurements.some(({ targetPrimaryAction }) => targetPrimaryAction !== null));
  assert.equal(parsedResult.measurements.fiveColumnTableMeasurements.length, 2);
  assert.equal(parsedResult.routeStateAssertions.length, 44);
  assert.ok(parsedResult.measurements.fiveColumnTableMeasurements.every((entry) => (
    entry.documentOverflow === 0
    && entry.headerCells.length === 5
    && entry.bodyCells.length === 5
    && [...entry.headerCells, ...entry.bodyCells].every(({ contentWidth }) => contentWidth >= MIN_TABLE_CELL_CONTENT_WIDTH)
  )));
  return parsedResult;
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
  next.stdout.on("data", (value) => { nextLog = appendBoundedLog(nextLog, value); });
  next.stderr.on("data", (value) => { nextLog = appendBoundedLog(nextLog, value); });
  const browser = spawn(chrome, [
    "--headless=new",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--no-first-run",
    "--no-default-browser-check",
    "--proxy-server=http://127.0.0.1:9",
    "--proxy-bypass-list=127.0.0.1;localhost;[::1]",
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
    const webSocketUrls = [];
    const blockedExternalRequests = [];
    const interceptionErrors = [];
    const interceptionTasks = new Set();
    cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
      if (["error", "assert"].includes(type)) consoleErrors.push(args.map(({ value, description }) => value ?? description).join(" "));
    });
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text));
    cdp.on("Network.requestWillBeSent", ({ request }) => networkUrls.push(request.url));
    cdp.on("Network.webSocketCreated", ({ url }) => webSocketUrls.push(url));
    cdp.on("Fetch.requestPaused", ({ requestId, request }) => {
      const task = (async () => {
        if (isBlockableExternalRequest(request.url)) {
          blockedExternalRequests.push(request.url);
          await cdp.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
          return;
        }
        await cdp.send("Fetch.continueRequest", { requestId });
      })().catch((error) => {
        if (!String(error).includes("Invalid InterceptionId")) interceptionErrors.push(String(error));
      }).finally(() => interceptionTasks.delete(task));
      interceptionTasks.add(task);
    });
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
      cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }),
    ]);

    const matrixSeen = new Set();
    const viewportMeasurements = [];
    const fiveColumnTableMeasurements = [];
    const screenshots = [];

    await setViewport(cdp, VIEWPORTS[1], matrixSeen);
    const providerStateAssertions = await exerciseProviderFixture(cdp, origin);
    const inventoryStateAssertions = await exerciseInventoryTruthStates(cdp, origin);
    const otherStateAssertions = await exerciseOtherRouteStates(cdp, origin);
    const routeStateAssertions = Object.freeze([
      ...providerStateAssertions,
      ...inventoryStateAssertions,
      ...otherStateAssertions,
    ]);

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
    fiveColumnTableMeasurements.push(await measureFiveColumnTable(cdp, "settings target five-column table desktop-1280x800"));
    screenshots.push(await screenshot(cdp, 4));
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[9]);
    viewportMeasurements.push(await measurePage(cdp, "seo desktop-1280x800"));
    fiveColumnTableMeasurements.push(await measureFiveColumnTable(cdp, "seo target five-column table desktop-1280x800"));
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
    screenshots.push(await screenshot(cdp, 8));

    await openDrawer(cdp);
    viewportMeasurements.push(await measurePage(cdp, "dashboard drawer-open mobile-390x844"));
    const targetReducedMotion = await measureTargetReducedMotion(cdp);
    screenshots.push(await screenshot(cdp, 9));
    await pressEscape(cdp);
    const escapeFocus = await assertDrawerClosedAndFocused(cdp, "Escape");

    await openDrawer(cdp);
    await dismissDrawerWithBackdrop(cdp);
    const backdropFocus = await assertDrawerClosedAndFocused(cdp, "backdrop");

    await openDrawer(cdp);
    await dispatchPointerClick(cdp, `document.querySelector('#panel-mobile-drawer button[aria-label="Panel menüsünü kapat"]')`, "drawer close button");
    const closeButtonFocus = await assertDrawerClosedAndFocused(cdp, "close-button");

    await openDrawer(cdp);
    await dismissDrawerWithSwipe(cdp);
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
    await navigate(cdp, origin, REPRESENTATIVE_ROUTES[3]);
    const dockMeasurements = await cdp.evaluate(`(() => {
      const dock=document.querySelector('nav[aria-label="Mobil panel menüsü"]');
      const workspace=document.querySelector('main')?.parentElement;
      const input=document.querySelector('[data-target-route] input:not([type="checkbox"])');
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
    await navigate(cdp, origin, "/");
    viewportMeasurements.push(await measurePage(cdp, "dashboard mobile-320x720"));
    screenshots.push(await screenshot(cdp, 13));

    await setViewport(cdp, VIEWPORTS[1], matrixSeen);
    await navigate(cdp, origin, "/products-evil");
    const productsEvilActive = await cdp.evaluate(`document.querySelector('a[href="/products"]')?.getAttribute('aria-current')==='page'`);
    assert.equal(productsEvilActive, false);
    const replay = await cdp.evaluate(`(async()=>{
      const mutation=()=>fetch('/api/merchant-admin/records/seo_product_entry',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','idempotency-key':'full-parity-replay'},body:JSON.stringify({name:'Keten Gömlek SEO',config:{resourceId:'keten-gomlek'},status:'active',expectedVersion:2})}).then((response)=>response.json());
      return [await mutation(),await mutation()];
    })()`);
    assert.equal(replay[0].replayed, false);
    assert.equal(replay[1].replayed, true);

    assert.deepEqual([...matrixSeen].sort(), VIEWPORTS.map((entry) => entry[2]).sort());
    assert.equal(screenshots.length, 14);
    await Promise.all([...interceptionTasks]);
    const externalUrls = networkUrls.filter((url) => !isPermittedNetworkUrl(url));
    const externalWebSocketAttempts = webSocketUrls.filter((url) => !isPermittedNetworkUrl(url));
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(exceptions, []);
    assert.deepEqual(externalUrls, []);
    assert.deepEqual(externalWebSocketAttempts, []);
    assert.deepEqual(blockedExternalRequests, []);
    assert.deepEqual(interceptionErrors, []);

    const minimumTarget = Math.min(...viewportMeasurements.map((entry) => entry.minimumTarget));
    const primaryContrast = Math.min(...viewportMeasurements.map((entry) => entry.primaryContrast).filter((entry) => entry !== null));
    const horizontalOverflow = Math.max(...viewportMeasurements.map((entry) => entry.horizontalOverflow));
    const reducedMotionDuration = Object.values(targetReducedMotion.targets).flatMap((target) => [
      target.transitionDuration,
      target.animationDuration,
    ]);
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
        reducedMotionDuration,
        targetReducedMotion,
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
        fiveColumnTableMeasurements,
      },
      mutationReplay: replay,
      routeStateAssertions,
      consoleErrors: consoleErrors.length,
      runtimeExceptions: exceptions.length,
      externalRequests: externalUrls.length,
      externalWebSocketAttempts: externalWebSocketAttempts.length,
      blockedExternalRequests: blockedExternalRequests.length,
      interceptionErrors: interceptionErrors.length,
      networkRequests: networkUrls.length,
      webSocketRequests: webSocketUrls.length,
    });
    writeFileSync(path.join(ARTIFACTS, "browser-acceptance.json"), `${JSON.stringify(result, null, 2)}\n`);
    const parsedResult = validateArtifacts();
    process.stdout.write(`PASS — full merchant local browser acceptance\n${JSON.stringify(parsedResult, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\nNEXT_LOG\n${nextLog}\n`);
    process.exitCode = 1;
  } finally {
    await cdp?.close();
    await Promise.all([stopProcess(browser), stopProcess(next)]);
    rmSync(profile, { recursive: true, force: true });
  }
}

if (process.env.CELEBIX_RUN_LOCAL_BROWSER_ACCEPTANCE !== "1") {
  process.stdout.write("SKIP — set CELEBIX_RUN_LOCAL_BROWSER_ACCEPTANCE=1 for dependency-free local Chromium acceptance\n");
} else {
  await main();
}
