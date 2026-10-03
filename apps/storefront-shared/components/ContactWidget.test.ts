import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { ContactWidgetConfig } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Widget = React.ComponentType<{ config: ContactWidgetConfig | null; storefrontName: string; hostname: string; brandColor: string }>;
const config = (): ContactWidgetConfig => ({
  schemaVersion: 1, enabled: true, title: "Nasıl yardımcı olabiliriz?", greeting: "Size uygun iletişim yolunu seçin.", buttonLabel: "Bize ulaşın",
  position: "bottom-right", icon: "message", theme: "brand", devices: { desktop: true, mobile: true },
  pages: ["home", "products", "categories", "content", "cart", "search"], whatsappMessage: "Merhaba", includeProductLink: true,
  hours: { enabled: false, timeZone: "Europe/Istanbul", days: [1, 2, 3, 4, 5], opensAt: "09:00", closesAt: "18:00", outsideBehavior: "message", outsideMessage: "Mesai dışında mesajınızı bırakabilirsiniz." },
  channels: [{ type: "whatsapp", enabled: true, label: "WhatsApp", value: "+905551234567" }, { type: "email", enabled: false, label: "E-posta", value: "hello@example.com" }],
});
function loadWidget(route: { pathname: string }) {
  return componentLoader({ "next/navigation": { usePathname: () => route.pathname } })<{ ContactWidget: Widget }>(new URL("./ContactWidget.tsx", import.meta.url)).ContactWidget;
}
const props = (value: ContactWidgetConfig | null) => ({ config: value, storefrontName: "Lilyum", hostname: "lilyum.example", brandColor: "#193e32" });
async function settle() { await React.act(async () => { await new Promise(resolve => window.setTimeout(resolve, 5)); }); }

test("disabled widget and disabled channels never offer contact links", async () => {
  const ContactWidget = loadWidget({ pathname: "/" });
  await withProductBrowser(async ({ container, render, click }) => {
    const media = window.matchMedia.bind(window);
    let mediaCalls = 0;
    window.matchMedia = query => { mediaCalls++; return media(query); };
    await render(React.createElement(ContactWidget, props(null)));
    assert.equal(container.querySelector("button"), null);
    assert.equal(mediaCalls, 0, "absent widgets do not subscribe to the browser");
    await render(React.createElement(ContactWidget, props({ ...config(), enabled: false })));
    assert.equal(container.querySelector("button"), null);
    assert.equal(mediaCalls, 0, "globally disabled widgets do not subscribe to the browser");
    await render(React.createElement(ContactWidget, props(config())));
    await click('button[aria-haspopup="dialog"]');
    assert.equal(container.querySelectorAll("a").length, 1);
    assert.equal(container.querySelector("a")?.getAttribute("href"), "https://wa.me/905551234567?text=Merhaba");
    assert.equal(container.textContent?.includes("E-posta"), false);
  });
});

test("dialog responds to Escape and outside click with focus returned to its launcher", async () => {
  const ContactWidget = loadWidget({ pathname: "/" });
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(ContactWidget, props(config())));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    await click('button[aria-haspopup="dialog"]');
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "false");
    assert.equal(dialog.getAttribute("aria-label"), "Nasıl yardımcı olabiliriz?");
    assert.equal(document.activeElement, dialog.querySelector('button[aria-label="İletişim panelini kapat"]'));
    await React.act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
    await click('button[aria-haspopup="dialog"]');
    const input = document.createElement("input"); document.body.append(input);
    await React.act(async () => { input.focus(); input.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true })); });
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, input, "outside interaction keeps its intended focus");
    assert.equal(document.body.style.overflow, "");
  });
});

test("persistent widget reevaluates routes and closes before excluded checkout or account routes", async () => {
  const route = { pathname: "/" }, ContactWidget = loadWidget(route);
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(ContactWidget, props(config())));
    await click('button[aria-haspopup="dialog"]');
    for (const pathname of ["/checkout", "/odeme/hizli", "/account", "/checkout/success", "/payments/provider"]) {
      route.pathname = pathname;
      await render(React.createElement(ContactWidget, props(config())));
      assert.equal(container.querySelector("button"), null, pathname);
    }
    route.pathname = "/products/ring";
    await render(React.createElement(ContactWidget, props(config())));
    assert.ok(container.querySelector('button[aria-haspopup="dialog"]'));
    assert.equal(container.querySelector('[role="dialog"]'), null, "route transition does not reopen contact panel");
  });
});

test("responsive device rule updates when the viewport changes", async () => {
  const ContactWidget = loadWidget({ pathname: "/" });
  await withProductBrowser(async ({ container, render }) => {
    const windowSize = (window as unknown as { happyDOM: { setWindowSize(size: { width: number; height: number }): void } }).happyDOM;
    windowSize.setWindowSize({ width: 1440, height: 900 });
    await render(React.createElement(ContactWidget, props({ ...config(), devices: { desktop: true, mobile: false } })));
    assert.ok(container.querySelector("button"));
    await React.act(async () => { windowSize.setWindowSize({ width: 390, height: 844 }); window.dispatchEvent(new window.Event("resize")); });
    assert.equal(container.querySelector("button"), null);
    await React.act(async () => { windowSize.setWindowSize({ width: 1024, height: 768 }); window.dispatchEvent(new window.Event("resize")); });
    assert.ok(container.querySelector("button"));
  });
});

test("product messages use explicit public product context and strip query and fragment", async () => {
  const route = { pathname: "/products/ring" }, ContactWidget = loadWidget(route);
  await withProductBrowser(async ({ container, render, click }) => {
    const article = document.createElement("article");
    article.dataset.contactProductTitle = "Altın yüzük";
    article.dataset.contactProductPath = "/products/ring?private=customer#address";
    document.body.append(article);
    await render(React.createElement(ContactWidget, props(config())));
    await click('button[aria-haspopup="dialog"]');
    const href = container.querySelector("a")!.getAttribute("href")!;
    const message = new URL(href).searchParams.get("text");
    assert.ok(message?.includes("Altın yüzük"));
    assert.ok(message?.includes("https://lilyum.example/products/ring"));
    assert.equal(message?.includes("private="), false);
    assert.equal(message?.includes("#address"), false);
    article.dataset.contactProductCanonical = "https://lilyum.example/products/canonical-ring";
    await settle();
    assert.ok(new URL(container.querySelector("a")!.getAttribute("href")!).searchParams.get("text")?.includes("https://lilyum.example/products/canonical-ring"));
    article.dataset.contactProductCanonical = "https://evil.example/products/ring";
    await settle();
    assert.equal(new URL(container.querySelector("a")!.getAttribute("href")!).searchParams.get("text"), "Merhaba");
    delete article.dataset.contactProductCanonical;
    article.dataset.contactProductPath = "//evil.example/products/ring";
    await settle();
    assert.equal(new URL(container.querySelector("a")!.getAttribute("href")!).searchParams.get("text"), "Merhaba");
    route.pathname = "/cart";
    await render(React.createElement(ContactWidget, props(config())));
    await click('button[aria-haspopup="dialog"]');
    assert.equal(new URL(container.querySelector("a")!.getAttribute("href")!).searchParams.get("text"), "Merhaba");
  });
});

test("mobile widget clears bottom navigation and purchase controls and hides during merchant overlays", async () => {
  const ContactWidget = loadWidget({ pathname: "/products/ring" });
  await withProductBrowser(async ({ container, render }) => {
    (window as unknown as { happyDOM: { setWindowSize(size: { width: number; height: number }): void } }).happyDOM.setWindowSize({ width: 390, height: 844 });
    const frame = document.createElement("div");
    frame.dataset.storefrontTheme = "guzide-deniz"; frame.dataset.guzideMobileNav = "true";
    document.body.append(frame);
    await render(React.createElement(ContactWidget, props(config())));
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "68px");
    const purchase = document.createElement("div"); purchase.dataset.guzideStickyPurchase = ""; frame.append(purchase);
    await settle();
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "82px");
    const modal = document.createElement("section"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); document.body.append(modal);
    await settle();
    assert.equal(container.querySelector("button"), null);
    modal.remove(); purchase.hidden = true; frame.dataset.storefrontTheme = "siora-deniz"; frame.dataset.guzideMobileNav = "false";
    const nav = document.createElement("nav"); nav.className = "siora-mobile-bottom"; frame.append(nav);
    await settle();
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "64px");
    nav.hidden = true; frame.dataset.storefrontTheme = "lilyum-deniz";
    const lilyumNav = document.createElement("nav"); lilyumNav.className = "lf-bottom-nav"; frame.append(lilyumNav);
    await settle();
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "65px");    lilyumNav.hidden = true;
    const sharedPurchase = document.createElement("div"); sharedPurchase.className = "purchase-panel is-mobile-sticky";
    const actions = document.createElement("div"); actions.className = "purchase-actions"; actions.style.position = "sticky";
    actions.getBoundingClientRect = () => new window.DOMRect(0, 760, 390, 84);
    sharedPurchase.append(actions); frame.append(sharedPurchase);
    await settle();
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "84px");
    actions.getBoundingClientRect = () => new window.DOMRect(0, 742, 390, 82);
    await React.act(async () => window.dispatchEvent(new window.Event("scroll")));
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "102px");
    nav.hidden = false; actions.getBoundingClientRect = () => new window.DOMRect(0, 698, 390, 82);
    await settle();
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "146px");
    nav.hidden = true;
    actions.getBoundingClientRect = () => new window.DOMRect(0, 900, 390, 84);
    await React.act(async () => window.dispatchEvent(new window.Event("scroll")));
    assert.equal(container.querySelector<HTMLElement>('[data-contact-widget]')?.style.getPropertyValue("--contact-mobile-offset"), "0px");

  });
});

test("outside hours presents the merchant message without claiming operator availability", async () => {
  const ContactWidget = loadWidget({ pathname: "/" });
  await withProductBrowser(async ({ container, render, click }) => {
    const value: ContactWidgetConfig = { ...config(), hours: { ...config().hours, enabled: true, timeZone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], opensAt: "00:00", closesAt: "00:01" } };
    await render(React.createElement(ContactWidget, props(value)));
    await click('button[aria-haspopup="dialog"]');
    assert.ok(container.textContent?.includes("Mesai dışı"));
    assert.ok(container.textContent?.includes(value.hours.outsideMessage));
    assert.equal(container.textContent?.includes("Çevrimiçi"), false);
    await render(React.createElement(ContactWidget, props({ ...value, hours: { ...value.hours, outsideBehavior: "hide" } })));
    assert.equal(container.querySelector("button"), null);
  });
});
