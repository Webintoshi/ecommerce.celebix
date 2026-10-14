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

test("phone login presentation keeps tenant branding and removes the password redirect", async () => {
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
      assert.equal(document.querySelector('a[href*="auth/login"]'), null);
      assert.match(document.body.textContent!, /Giriş hazırlanıyor/);
      assert.equal(document.querySelector("header h1")?.textContent, model.displayName);
      assert.deepEqual([...document.querySelectorAll('[data-login-action]')].map(link => [link.textContent, link.getAttribute('href')]), [
        ['Yeni mağaza açKendi mağazanı dakikalar içinde aç.', 'https://ecommerce.celebix.co/kayit'],
        ['Şube ekleMevcut mağazana şube ekle.', 'https://ecommerce.celebix.co/kayit'],
      ]);
      assert.equal(document.querySelectorAll("input, form").length, 0);
      assert.equal(document.querySelector(".tenant-login-illustration")?.getAttribute("alt"), "İşinizi kolaylaştıran teknoloji. Celebix — daha fazlası seninle.");
      assert.deepEqual([...document.querySelectorAll('nav[aria-label="Celebix bağlantıları"] a')].map(link => link.getAttribute('href')), [
        'https://celebix.net/tr/gizlilik', 'https://celebix.net/tr/kullanim-kosullari', 'https://celebix.net/tr/iletisim',
      ]);
      assert.equal(document.querySelectorAll('aside li').length, 3);
      assert.equal(document.querySelector(".tenant-login-mark"), null);
      assert.equal(document.body.textContent!.includes('Güvenli, mağazaya özel erişim'), false);
    } finally {
      await window.happyDOM.close();
    }
  }
});
