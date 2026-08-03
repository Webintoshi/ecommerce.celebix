import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ARTIFACTS = path.join(ROOT, ".codex-artifacts/starter-retail-experience");
const VIEWPORTS = Object.freeze([
  Object.freeze([1440, 1000]),
  Object.freeze([1025, 768]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
  Object.freeze([320, 720]),
]);
const CHROME = [process.env.CHROME_BIN, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((candidate) => candidate && existsSync(candidate));
function validateBase(raw) {
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username || url.password || url.port === "" || url.pathname !== "/" || url.search || url.hash) throw new Error("STOREFRONT_BASE_URL_must_be_loopback_http_origin");
  return url.origin;
}
let BASE = "";
const BUILT_MODE = process.env.STOREFRONT_ACCEPTANCE_MODE === "built";
const PUBLIC_ORIGIN = BUILT_MODE ? (() => {
  const value = process.env.STOREFRONT_PUBLIC_ORIGIN ?? "";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || url.origin !== value) throw new Error("STOREFRONT_PUBLIC_ORIGIN_must_be_canonical_https_origin");
  return value;
})() : null;

function createFixtureApp() {
  const fixture = path.join(ARTIFACTS, "browser-fixture");
  const app = path.join(fixture, "app");
  const api = path.join(app, "api/cart/[action]");
  const newsletterApi = path.join(app, "api/newsletter/subscriptions");
  mkdirSync(api, { recursive: true });
  mkdirSync(newsletterApi, { recursive: true });
  writeFileSync(path.join(fixture, "package.json"), `${JSON.stringify({ private: true }, null, 2)}\n`);
  writeFileSync(path.join(fixture, "next.config.mjs"), "export default Object.freeze({allowedDevOrigins:Object.freeze(['127.0.0.1']),devIndicators:false,experimental:Object.freeze({externalDir:true})});\n");
  writeFileSync(path.join(fixture, "tsconfig.json"), `${JSON.stringify({ compilerOptions: { jsx: "react-jsx", lib: ["dom", "dom.iterable", "esnext"], module: "esnext", moduleResolution: "bundler", noEmit: true, paths: { "@/*": ["../../../apps/storefront-shared/*"] }, target: "ES2022", allowJs: true, skipLibCheck: true, strict: false, incremental: true, esModuleInterop: true, resolveJsonModule: true, isolatedModules: true, plugins: [{ name: "next" }] }, include: ["next-env.d.ts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.ts", "**/*.tsx"], exclude: ["node_modules"] }, null, 2)}\n`);
  writeFileSync(path.join(fixture, "next-env.d.ts"), "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n");
  writeFileSync(path.join(app, "layout.tsx"), `import "../../../../apps/storefront-shared/app/globals.css";\nexport default function Layout({children}:{children:React.ReactNode}){return <html lang="tr"><body>{children}</body></html>}\n`);
  writeFileSync(path.join(app, "fixture.tsx"), String.raw`
import { buildDefaultStarterPresentation } from "@celebix/saas-contracts";
import { CampaignHome } from "../../../../apps/storefront-shared/components/CampaignHome";
import { ProductDetailExperience } from "../../../../apps/storefront-shared/components/ProductDetailExperience";
import { ProductExplorer } from "../../../../apps/storefront-shared/components/ProductExplorer";
import { ProductGrid } from "../../../../apps/storefront-shared/components/ProductGrid";
import { StorefrontFrame } from "../../../../apps/storefront-shared/components/StorefrontFrame";

const svg=(label:string,start:string,end:string,width=900,height=1200)=>"data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="'+start+'"/><stop offset="1" stop-color="'+end+'"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="50%" cy="38%" r="18%" fill="rgba(255,255,255,.24)"/><path d="M180 '+(height*.92)+' Q '+(width*.5)+' '+(height*.45)+' '+(width-180)+' '+(height*.92)+'" fill="rgba(255,255,255,.3)"/><text x="50%" y="94%" text-anchor="middle" fill="white" font-family="Arial" font-size="34" letter-spacing="8">'+label+'</text></svg>');
const asset=(name:string,start:string,end:string,width=900,height=1200)=>({url:svg(name,start,end,width,height),mediaType:"image/svg+xml",altText:name,width,height});
const product=(index:number,title:string,priceCents:number,start:string,end:string)=>({id:"10000000-0000-4000-8000-00000000000"+index,slug:"urun-"+index,title,description:"## Zamansız tasarım\n\nGünlük kullanıma uyum sağlayan, özenli işçilikle tamamlanan seçkin bir parça.",brand:{name:"Atölye",slug:"atolye"},categoryPath:[{name:"Koleksiyon",slug:"koleksiyon"}],currency:"TRY",status:"active",priceCents,compareAtCents:index===1?priceCents+320000:undefined,available:true,variants:[{id:"20000000-0000-4000-8000-00000000000"+index,title:"Standart",sku:"ST-00"+index,priceCents,stockTracking:true,stockQuantity:8,available:true,attributes:{}}],media:[{id:"30000000-0000-4000-8000-00000000000"+index,productId:"10000000-0000-4000-8000-00000000000"+index,url:svg(title,start,end),mediaType:"image/svg+xml",altText:title,width:900,height:1200,sortOrder:0},{id:"40000000-0000-4000-8000-00000000000"+index,productId:"10000000-0000-4000-8000-00000000000"+index,url:svg(title+" DETAY",end,start),mediaType:"image/svg+xml",altText:title+" detay",width:900,height:1200,sortOrder:1}],merchandising:{highlights:["El işçiliği detayları","Günlük kullanıma uygun","Özenli paketleme"],materialsAndCare:"Yumuşak bezle nazikçe temizleyin.",certifications:["Kalite kontrolünden geçirilmiştir"],sizeGuide:{heading:"Ölçü rehberi",body:"**Standart ölçü**\n\nSipariş öncesinde ürün ölçülerini kontrol edin."}},reviews:[{reviewerName:"A. K.",rating:5,title:"Çok zarif",body:"Ürün beklediğimden daha özenli ve şık geldi."}]});
export const products=[product(1,"İnci Işıltılı Kolye",1289000,"#d8c7b8","#7d6557"),product(2,"Minimal Altın Bileklik",849000,"#e8d8bb","#a88355"),product(3,"Zarif Taşlı Yüzük",1049000,"#d8d2cc","#756a63"),product(4,"Modern Halka Küpe",629000,"#ddd5c7","#96836e")];
const base=buildDefaultStarterPresentation({name:"Atölye Kuyum"});
export const presentation={...base,supportEmail:"destek@example.test",visual:{...base.visual,headerStyle:"overlay",headerWidth:"wide",sectionSpacing:"airy",productCardStyle:"editorial",productImageRatio:"portrait"},announcement:{items:["Ücretsiz teslimat · 2.500 TL üzeri siparişlerde"],destination:"/products"},navigation:{items:[{name:"Yeni",slug:"yeni",children:[]},{name:"Koleksiyonlar",slug:"koleksiyonlar",children:[{name:"Kolyeler",slug:"kolyeler",children:[]},{name:"Bileklikler",slug:"bileklikler",children:[]}]},{name:"Hediyeler",slug:"hediyeler",children:[]}]},sections:[{kind:"hero",slides:[{eyebrow:"YENİ KOLEKSİYON",heading:"Sade çizgiler, kalıcı ışıltı",body:"Her güne eşlik eden modern mücevherler.",desktopImage:asset("YENİ KOLEKSİYON","#2b2522","#bca38e",1600,900),mobileImage:asset("YENİ KOLEKSİYON","#3b322d","#bca38e",900,1200),destination:"/products",hotspot:{productSlug:products[0].slug,title:products[0].title,priceCents:products[0].priceCents,currency:"TRY"}}]},{kind:"category_grid",heading:"Tarzınızı tamamlayın",items:[{name:"Kolyeler",slug:"kolyeler",image:asset("KOLYELER","#c7b49d","#69584c")},{name:"Bileklikler",slug:"bileklikler",image:asset("BİLEKLİKLER","#d5c7b4","#766753")},{name:"Yüzükler",slug:"yuzukler",image:asset("YÜZÜKLER","#bfb7b0","#655c57")},{name:"Küpeler",slug:"kupeler",image:asset("KÜPELER","#d7cab9","#8b735d")}]},{kind:"product_row",key:"featured",heading:"Öne çıkan parçalar",source:"latest",limit:4},{kind:"value_propositions",items:[{icon:"sparkles",heading:"Özenli işçilik",body:"Her ürün gönderimden önce tek tek kontrol edilir."},{icon:"heart",heading:"Hediye etmeye hazır",body:"Zarif ve güvenli paketleme ile teslim edilir."},{icon:"return",heading:"Kolay destek",body:"Siparişinizin her adımında yanınızdayız."}]},{kind:"split_campaign",panels:[{eyebrow:"SEÇKİ",heading:"Günün ışıltısı",body:"Sade kombinlerin tamamlayıcısı.",image:asset("GÜNÜN IŞILTISI","#a99a8d","#4b4039",1200,900),destination:"/products"},{eyebrow:"HİKÂYE",heading:"Atölyeden size",body:"Detaylara verilen önemi keşfedin.",image:asset("ATÖLYEDEN","#c9beb1","#71665d",1200,900),destination:"/policies/membership"}]},{kind:"brand_story",eyebrow:"BİZİM HİKÂYEMİZ",heading:"Günlük zarafete modern bir yorum",body:"Uzun yıllar severek kullanacağınız parçaları sade bir alışveriş deneyimiyle buluşturuyoruz.",image:asset("ATÖLYE","#d9cec1","#85776a",1200,900),destination:"/products"},{kind:"testimonials",heading:"Müşterilerimiz anlatıyor",items:[{reviewerName:"Aylin K.",rating:5,body:"Paketleme ve ürün kalitesi çok özenliydi."},{reviewerName:"Selin D.",rating:5,body:"Zarif tasarım her kombinime uydu."},{reviewerName:"Ece T.",rating:5,body:"Hızlı destek ve sorunsuz teslimat."}]}],productDetail:{galleryStyle:"rail",showSku:true,showBrand:true,showBreadcrumbs:true,showRelatedProducts:true,showApprovedReviews:true,mobileStickyPurchase:true,showSizeGuide:true,informationSections:["description","materials_and_care","certifications","shipping_and_returns"]},cart:{showCheckoutReadiness:true,showShippingProgress:true,trustMessage:"Güvenli ödeme ve özenli teslimat"},footer:{...base.footer,tone:"dark",newsletter:{enabled:true,heading:"Atölyeden haberler",body:"Yeni koleksiyonlar ve seçili fırsatlar için kaydolun.",consentLabel:"Ticari ileti onayını kabul ediyorum."},social:[]}};
export const storefront={schemaVersion:2,id:"00000000-0000-4000-8000-000000000001",name:"Atölye Kuyum",slug:"atolye-kuyum",hostname:"retail.example.test",primaryHostname:"retail.example.test",canonicalUrl:"http://127.0.0.1/",currency:"TRY",locale:"tr",themeKey:"starter",presentation};
export function FixturePage({path}:{path:string}){if(path==="/")return <CampaignHome storefront={storefront as any} projection={{presentation,productRows:[{key:"featured",items:products}]} as any}/>;if(path==="/products")return <StorefrontFrame storefront={storefront as any}><section className="store-container store-page"><header className="page-heading"><span>KOLEKSİYON</span><h1>Tüm ürünler</h1><p>Günlük zarafet için seçilen parçaları keşfedin.</p></header><ProductExplorer products={products as any} cardStyle="editorial" imageRatio="portrait"/></section></StorefrontFrame>;if(path.startsWith("/products/"))return <StorefrontFrame storefront={storefront as any}><ProductDetailExperience product={products[0] as any} relatedProducts={products.slice(1) as any} publishedPolicies={[]} options={presentation.productDetail as any} cardStyle="editorial" imageRatio="portrait"/></StorefrontFrame>;if(path==="/search")return <StorefrontFrame storefront={storefront as any}><section className="store-container store-page"><header className="page-heading"><span>ARAMA</span><h1>Arama sonucu</h1></header><ProductGrid products={[]} cardStyle="editorial" imageRatio="portrait" emptyMessage="Aramanızla eşleşen ürün bulunamadı."/></section></StorefrontFrame>;return <StorefrontFrame storefront={storefront as any}><section className="store-container store-page"><h1>Sayfa</h1></section></StorefrontFrame>}
`);
  writeFileSync(path.join(app, "page.tsx"), `import {FixturePage} from "./fixture";\nexport default function Page(){return <FixturePage path="/"/>}\n`);
  mkdirSync(path.join(app, "[...segments]"), { recursive: true });
  writeFileSync(path.join(app, "[...segments]/page.tsx"), `import {FixturePage} from "../fixture";\nexport default async function Page({params}:{params:Promise<{segments:string[]}>}){const value=await params;return <FixturePage path={'/'+value.segments.join('/')}/>}\n`);
  const emptyCart = { version: 1, currency: "TRY", itemCount: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0, checkoutReady: false, checkoutBlocker: "empty_cart", items: [] };
  const line = { productId: "10000000-0000-4000-8000-000000000001", variantId: "20000000-0000-4000-8000-000000000001", slug: "urun-1", title: "İnci Işıltılı Kolye", variantTitle: "Standart", quantity: 1, unitPriceCents: 1289000, lineTotalCents: 1289000, available: true };
  writeFileSync(path.join(app, "api/cart/route.ts"), `const cart=${JSON.stringify(emptyCart)};\nexport function GET(){return Response.json({cart})}\n`);
  writeFileSync(path.join(api, "route.ts"), `const cart=${JSON.stringify({ version: 2, currency: "TRY", itemCount: 1, subtotalCents: 1289000, shippingCents: 0, totalCents: 1289000, checkoutReady: true, checkoutBlocker: null, items: [line] })};\nexport function POST(){return Response.json({cart},{headers:{"set-cookie":"fixture_cart=present; Path=/; SameSite=Lax"}})}\n`);
  writeFileSync(path.join(newsletterApi, "route.ts"), `export function POST(request:Request){return request.headers.has("cookie")?Response.json({outcome:"subscribed"}):Response.json({code:"cart_cookie_required"},{status:412})}\n`);
  return fixture;
}

function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close((error) => error ? reject(error) : resolve(typeof address === "object" && address ? address.port : 0)); }); }); }
async function waitForHttp(url, timeout = 30_000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { try { const response = await fetch(url); if (response.ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`http_timeout:${url}`); }

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("cdp_open_timeout")), 10_000); this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true }); this.socket.addEventListener("error", () => reject(new Error("cdp_open_failed")), { once: true }); });
    this.socket.addEventListener("message", ({ data }) => { const message = JSON.parse(String(data)); if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result ?? {}); return; } for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {}); });
  }
  on(method, listener) { const group = this.listeners.get(method) ?? new Set(); group.add(listener); this.listeners.set(method, group); return () => group.delete(listener); }
  async send(method, params = {}) { await this.ready; const id = ++this.id; const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return result; }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(`browser_evaluation_failed:${result.exceptionDetails.text}`); return result.result?.value; }
  close() { this.socket.close(); }
}

async function waitFor(cdp, expression, label, timeout = 20_000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (await cdp.evaluate(`Boolean(${expression})`)) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`browser_wait_timeout:${label}`); }
async function viewport(cdp, width, height) { await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile: width <= 1024 }); await waitFor(cdp, `innerWidth===${width}&&innerHeight===${height}`, `${width}x${height}`); }
async function navigate(cdp, route) { const result = await cdp.send("Page.navigate", { url: `${BASE}${route}` }); if (result.errorText && result.errorText !== "net::ERR_ABORTED") throw new Error(`browser_navigation_failed:${route}:${result.errorText}`); await waitFor(cdp, `document.readyState==='complete'&&location.pathname===${JSON.stringify(route.split("?", 1)[0])}`, route); }
async function click(cdp, expression, label) { assert.equal(await cdp.evaluate(`(() => { const node=${expression}; if(!(node instanceof HTMLElement)||!node.getClientRects().length)return false;node.click();return true;})()`), true, label); }
async function key(cdp, value) { await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: value, code: value }); await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: value, code: value }); }
async function screenshot(cdp, name) { const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const target = path.join(ARTIFACTS, name); writeFileSync(target, Buffer.from(data, "base64")); return target; }

async function measure(cdp, label) {
  const value = await cdp.evaluate(`(() => {
    const visible=(node)=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return node.getClientRects().length>0&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0};
    const selected=[...document.querySelectorAll('.store-utilities a,.store-utilities button,.store-button,.heroAction,button:not([disabled]),input:not([disabled])')].filter(visible);
    const targets=selected.map((node)=>{const hit=node.matches('input[type=checkbox],input[type=radio]')?node.closest('label')??node:node;const rect=hit.getBoundingClientRect();return {width:rect.width,height:rect.height,label:node.getAttribute('aria-label')??node.textContent?.trim().slice(0,40)??node.tagName}});
    const rgb=(input)=>input.match(/[\\d.]+/g)?.slice(0,3).map(Number)??[0,0,0];
    const luminance=(input)=>rgb(input).map((part)=>part/255).map((part)=>part<=.03928?part/12.92:Math.pow((part+.055)/1.055,2.4)).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0);
    const primary=[...document.querySelectorAll('.store-button:not(.store-button-secondary):not(.is-disabled):not(:disabled),.heroAction')].filter(visible).map((node)=>{const style=getComputedStyle(node),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
    const overflowing=[...document.querySelectorAll('body *')].filter(visible).map((node)=>{const rect=node.getBoundingClientRect();return {tag:node.tagName,className:typeof node.className==='string'?node.className.slice(0,120):'',left:rect.left,right:rect.right,width:rect.width}}).filter(({left,right})=>left<-.5||right>innerWidth+.5).slice(0,12);
    return { label:${JSON.stringify(label)}, horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth), overflowing, minimumTarget:targets.length?Math.min(...targets.map(({width,height})=>Math.min(width,height))):48, undersized:targets.filter(({width,height})=>Math.min(width,height)<48), primaryContrast:primary.length?Math.min(...primary):null, positiveTabindex:[...document.querySelectorAll('[tabindex]')].filter((node)=>Number(node.getAttribute('tabindex'))>0).length };
  })()`);
  assert.equal(value.horizontalOverflow, 0, `${label}:horizontalOverflow:${JSON.stringify(value.overflowing)}`);
  assert.ok(value.minimumTarget >= 48, `${label}:minimumTarget:${value.minimumTarget}:${JSON.stringify(value.undersized)}`);
  if (value.primaryContrast !== null) assert.ok(value.primaryContrast >= 4.5, `${label}:primaryContrast:${value.primaryContrast}`);
  assert.equal(value.positiveTabindex, 0, `${label}:positiveTabindex`);
  return value;
}

async function capture(cdp, measurements, screenshots, route, width, height, name, waitExpression = "document.querySelector('.starter-storefront')") {
  await viewport(cdp, width, height); await navigate(cdp, route); try { await waitFor(cdp, `(${waitExpression})&&!document.querySelector('.loading-page')`, name); } catch (error) { const state = await cdp.evaluate("({href:location.href,status:document.readyState,title:document.title,text:document.body?.innerText?.slice(0,500),html:document.documentElement?.outerHTML?.slice(0,500)})"); throw new Error(`${error.message}:${JSON.stringify(state)}`); }
  measurements.push(await measure(cdp, name)); screenshots.push(await screenshot(cdp, `${name}.png`));
}

async function main() {
  assert.ok(CHROME, "chrome_binary_required");
  rmSync(ARTIFACTS, { recursive: true, force: true }); mkdirSync(ARTIFACTS, { recursive: true });
  let fixture = null, fixtureServer = null, fixtureLog = "";
  if (process.env.STOREFRONT_BASE_URL) {
    assert.equal(BUILT_MODE, true, "external_base_requires_built_mode");
    BASE = validateBase(process.env.STOREFRONT_BASE_URL);
  } else {
    fixture = createFixtureApp();
    const fixturePort = await freePort();
    BASE = validateBase(`http://127.0.0.1:${fixturePort}`);
    fixtureServer = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", fixture, "--webpack", "-p", String(fixturePort)], { cwd: ROOT, env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    fixtureServer.stdout.on("data", (value) => { fixtureLog = `${fixtureLog}${String(value)}`.slice(-20_000); });
    fixtureServer.stderr.on("data", (value) => { fixtureLog = `${fixtureLog}${String(value)}`.slice(-20_000); });
    try { await waitForHttp(BASE, 60_000); } catch (error) { throw new Error(`${String(error)}\n${fixtureLog}`); }
  }
  const profile = mkdtempSync(path.join(tmpdir(), "celebix-starter-retail-chrome-"));
  const debugPort = await freePort();
  const chrome = spawn(CHROME, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--headless=new", "--disable-extensions", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let cdp;
  const consoleErrors = [], networkFailures = [], interceptionErrors = [], sensitiveSurface = { dom: false, console: false, networkUrl: false };
  try {
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
    const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const page = tabs.find((tab) => tab.type === "page" && tab.url === "about:blank") ?? tabs.find((tab) => tab.type === "page");
    assert.ok(page?.webSocketDebuggerUrl, "browser_page_target_required"); cdp = new Cdp(page.webSocketDebuggerUrl);
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    if (BUILT_MODE) assert.equal(new URL(PUBLIC_ORIGIN).protocol, "https:", "built_public_authority_required");
    cdp.on("Runtime.consoleAPICalled", ({ type, args = [] }) => { const value = args.map(({ value: text, description }) => String(text ?? description ?? "")).join(" "); if (/__Host-celebix_|(?:c1|i1|u1|r1)[.][A-Za-z0-9_-]+/u.test(value)) sensitiveSurface.console = true; if (["error", "assert"].includes(type)) consoleErrors.push(type); });
    cdp.on("Network.loadingFailed", ({ canceled }) => { if (!canceled) networkFailures.push("failed"); });
    cdp.on("Network.requestWillBeSent", ({ request }) => { if (/__Host-celebix_|(?:c1|i1|u1|r1)[.]current/u.test(request.url)) sensitiveSurface.networkUrl = true; });

    const measurements = [], screenshots = [];
    for (const [width, height] of VIEWPORTS) await capture(cdp, measurements, screenshots, "/", width, height, `home-${width}x${height}`);
    await viewport(cdp, 390, 844); await navigate(cdp, "/"); await click(cdp, "[...document.querySelectorAll('button')].find((node)=>node.getAttribute('aria-label')==='Menüyü aç')", "navigation-open"); await waitFor(cdp, "document.querySelector('[role=dialog][aria-label=\"Mobil menü\"]')", "navigation"); screenshots.push(await screenshot(cdp, "navigation-390x844.png")); await key(cdp, "Escape");
    await capture(cdp, measurements, screenshots, "/products", 1440, 1000, "listing-1440x1000", "document.querySelector('.product-card-link')");
    await capture(cdp, measurements, screenshots, "/products", 390, 844, "listing-390x844", "document.querySelector('.product-card-link')");
    const productPath = await cdp.evaluate("document.querySelector('.product-card-link')?.getAttribute('href')"); assert.match(productPath, /^\/products\/[a-z0-9-]+$/u);
    for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844], [320, 720]]) await capture(cdp, measurements, screenshots, productPath, width, height, `product-detail-${width}x${height}`, "document.querySelector('.purchase-panel')");
    await viewport(cdp, 1440, 1000); await navigate(cdp, productPath); await waitFor(cdp, "document.querySelector('.purchase-panel')&&!document.querySelector('.loading-page')", "side-cart-product");
    const variant = "document.querySelector('.purchase-panel input[type=radio]:not(:disabled)')?.closest('label')"; if (await cdp.evaluate(`Boolean(${variant})`)) await click(cdp, variant, "variant");
    await click(cdp, "[...document.querySelectorAll('.purchase-actions button')].find((node)=>node.textContent.includes('Sepete ekle'))", "add-to-cart"); await waitFor(cdp, "document.querySelector('.side-cart-dialog')", "side-cart"); screenshots.push(await screenshot(cdp, "side-cart-1440x1000.png")); measurements.push(await measure(cdp, "side-cart-1440x1000"));
    if (BUILT_MODE) assert.equal(await cdp.evaluate("document.cookie.includes('__Host-celebix_cart=')"), false, "cart_cookie_must_remain_httponly");
    else await waitFor(cdp, "document.cookie.includes('fixture_cart=present')", "cart-cookie");
    await viewport(cdp, 390, 844); screenshots.push(await screenshot(cdp, "side-cart-390x844.png")); measurements.push(await measure(cdp, "side-cart-390x844")); await key(cdp, "Escape"); await waitFor(cdp, "!document.querySelector('.side-cart-dialog')&&getComputedStyle(document.body).overflow!=='hidden'", "side-cart-closed");
    for (const [width, height] of [[1440, 1000], [390, 844]]) { await viewport(cdp, width, height); await navigate(cdp, "/"); await waitFor(cdp, "document.querySelector('.retail-newsletter-form')", "footer-newsletter"); await cdp.evaluate("scrollTo(0,document.documentElement.scrollHeight)"); await waitFor(cdp, "scrollY>0&&document.querySelector('.retail-footer')?.getBoundingClientRect().bottom<=innerHeight+1", "footer-visible"); screenshots.push(await screenshot(cdp, `footer-newsletter-${width}x${height}.png`)); measurements.push(await measure(cdp, `footer-newsletter-${width}x${height}`)); }
    await cdp.evaluate(`(() => { const input=document.querySelector('.retail-newsletter-form input[type=email]'),checkbox=document.querySelector('.retail-newsletter-form input[type=checkbox]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!(input instanceof HTMLInputElement)||!(checkbox instanceof HTMLInputElement)||!setter)return false;setter.call(input,'browser@example.test');input.dispatchEvent(new Event('input',{bubbles:true}));checkbox.click();return true;})()`);
    await click(cdp, "document.querySelector('.retail-newsletter-form button[type=submit]')", "newsletter-submit-after-cart");
    await waitFor(cdp, "document.querySelector('.retail-newsletter-form [aria-live=polite]')?.textContent==='Aboneliğiniz kaydedildi.'", "newsletter-cookie-compatible");
    await capture(cdp, measurements, screenshots, "/search?q=none", 390, 844, "empty-partial-390x844", "document.querySelector('.store-empty')");
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const reducedMotionDuration = await cdp.evaluate("getComputedStyle(document.documentElement).scrollBehavior==='auto'?[...document.querySelectorAll('*')].filter((node)=>getComputedStyle(node).transitionDuration!=='0s').map((node)=>getComputedStyle(node).transitionDuration).at(0)??'0.00001s':'invalid'");
    assert.ok(["1e-05s", "0.00001s", "0.01ms"].includes(reducedMotionDuration), `reducedMotionDuration:${reducedMotionDuration}`);
    sensitiveSurface.dom = /__Host-celebix_|(?:c1|i1|u1|r1)[.][A-Za-z0-9_-]{20,}/u.test(await cdp.evaluate("document.documentElement.innerHTML"));
    assert.deepEqual(sensitiveSurface, { dom: false, console: false, networkUrl: false }); assert.deepEqual(consoleErrors, []); assert.deepEqual(networkFailures, []); assert.deepEqual(interceptionErrors, []);
    const result = Object.freeze({ applicationMode: BUILT_MODE ? "built" : "fixture", baseOrigin: "loopback", viewportMatrix: VIEWPORTS.map(([width, height]) => ({ width, height })), measurements, newsletterAfterCart: true, reducedMotionDuration, screenshotCount: screenshots.length, screenshots: screenshots.map((file) => path.relative(ROOT, file)), consoleErrors: 0, networkFailures: 0, sensitiveSurface });
    writeFileSync(path.join(ARTIFACTS, "browser-acceptance.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`PASS starter retail browser acceptance (${screenshots.length} screenshots)\n`);
  } finally {
    cdp?.close(); if (chrome.exitCode === null) { chrome.kill("SIGTERM"); await Promise.race([new Promise((resolve) => chrome.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]); } if (chrome.exitCode === null) chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (fixtureServer?.exitCode === null) { fixtureServer.kill("SIGTERM"); await Promise.race([new Promise((resolve) => fixtureServer.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]); }
    if (fixtureServer?.exitCode === null) fixtureServer.kill("SIGKILL");
    if (fixture) rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

await main();
