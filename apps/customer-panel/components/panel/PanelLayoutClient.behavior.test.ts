import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { compile, mounted } from "../../lib/mira-final-test-support.ts";

test("the first panel link jumps to the focusable main content before the navigation", async () => {
  const { PanelLayoutClient } = compile("components/panel/PanelLayoutClient.tsx", {
    "next/navigation": { usePathname: () => "/products" },
    "./PanelMobileDock": { PanelMobileDock: () => null },
    "./PanelInitialDataGate": { PanelInitialDataBoundary: ({ children }: { children: React.ReactNode }) => children },
    "./PanelSidebar": { PanelSidebar: ({ mode }: { mode: string }) => mode === "desktop" ? React.createElement("a", { href: "/products" }, "Ürünler") : null },
    "./PanelTopbarChrome": { PanelTopbarChromeProvider: ({ children }: { children: React.ReactNode }) => children },
    "./PanelTopbarUtilities": { PanelTopbarUtilities: () => null },
  });
  await mounted(PanelLayoutClient, { model: {}, children: React.createElement("p", null, "Ürün listesi") }, async (host, window) => {
    const skip = host.querySelector("a");
    assert.equal(skip.textContent, "Ana içeriğe geç");
    const main = host.querySelector("main");
    assert.ok(main.id);
    assert.equal(skip.getAttribute("href"), `#${main.id}`);
    assert.equal(main.tabIndex, -1);
    await React.act(async () => skip.click());
    assert.equal(window.document.activeElement, main);
  });
});
