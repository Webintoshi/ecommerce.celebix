import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";

import { compile } from "../../lib/mira-final-test-support.ts";
import type { TenantAdminLoginModel } from "../../lib/tenant-admin-login-model.ts";

const { TenantLogin } = compile("components/auth/TenantLogin.tsx", {
  "next/link": {
    __esModule: true,
    default: ({ prefetch, children, ...props }: ComponentProps<"a"> & { prefetch: boolean; children: ReactNode }) => {
      assert.equal(prefetch, false, "Entry links must not start login through prefetch");
      return createElement("a", props, children);
    },
  },
});

test("login presentation keeps tenant identity and the supplied secure entry destination", async () => {
  const models: TenantAdminLoginModel[] = [
    { kind: "tenant", displayName: "Güzide Kuyumcu", logoUrl: null, accentColor: "#b58a4a", canonicalAdminOrigin: "https://admin.guzidekuyumcu.com", loginHref: "https://panel.saas-staging.celebix.site/auth/login?destination=admin.guzidekuyumcu.com" },
    { kind: "tenant", displayName: "Butik Siora", logoUrl: "https://assets.example.test/store.svg", accentColor: "#ff6500", canonicalAdminOrigin: "https://butik-siora.admin.saas-staging.celebix.net", loginHref: "https://panel.saas-staging.celebix.net/auth/login?destination=butik-siora.admin.saas-staging.celebix.net" },
    { kind: "generic", displayName: "Celebix", logoUrl: null, accentColor: "#ff6500", canonicalAdminOrigin: null, loginHref: "/auth/login" },
  ];

  for (const model of models) {
    const window = new Window();
    try {
      window.document.body.innerHTML = renderToStaticMarkup(createElement(TenantLogin, { model }));
      const document = window.document;
      assert.equal(document.querySelectorAll("h1").length, 1);
      assert.equal(document.querySelector("h1")?.textContent, model.displayName);
      assert.equal(document.querySelector(".tenant-login-button")?.getAttribute("href"), model.loginHref);
      assert.equal(document.querySelector(".tenant-login-secondary")?.getAttribute("href"), "https://ecommerce.celebix.co/kayit");
      assert.equal(document.querySelectorAll("input, form").length, 0);
      assert.equal(document.querySelector(".tenant-login-artwork")?.getAttribute("aria-hidden"), "true");
      assert.equal(document.querySelector(".tenant-login-illustration")?.getAttribute("alt"), "");
      const logo = document.querySelector(".tenant-login-mark img");
      assert.equal(logo?.getAttribute("src") ?? null, model.logoUrl);
      if (!model.logoUrl) assert.equal(document.querySelector(".tenant-login-mark")?.textContent, model.displayName.charAt(0));
    } finally {
      await window.happyDOM.close();
    }
  }
});
