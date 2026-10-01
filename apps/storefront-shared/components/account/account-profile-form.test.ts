import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { componentLoader, withProductBrowser } from "../product-variant-media-test-utils.ts";

if (process.env.NODE_OPTIONS?.includes("--conditions=react-server")) {
  test("account profile browser behavior", () => {
    execFileSync(process.execPath, ["--experimental-transform-types", "--test", fileURLToPath(import.meta.url)], { env: { ...process.env, NODE_OPTIONS: "" }, stdio: "pipe" });
  });
} else {
  const load = componentLoader();
  const { AccountProfileForm } = load<{ AccountProfileForm: React.ComponentType<Record<string, unknown>> }>(new URL("./AccountProfileForm.tsx", import.meta.url));

  test("profile forms use POST before client JavaScript initializes", () => {
    for (const mode of ["complete", "update"]) {
      const markup = renderToStaticMarkup(React.createElement(AccountProfileForm, { mode }));
      const forms = markup.match(/<form\b[^>]*>/gu) ?? [];
      assert.equal(forms.length, 1, `${mode} renders one form`);
      assert.match(forms[0]!, /\bmethod="post"(?=>)/u, `${mode} must not send profile data in a GET URL`);
    }
  });

  test("profile update uses storefront classes in published and preview frames", async () => {
    for (const { theme, ink, paper, line } of [
      { theme: "published", ink: "#111111", paper: "#fafafa", line: "#bbbbbb" },
      { theme: "preview", ink: "#232323", paper: "#ffffff", line: "#dedede" },
    ]) {
      await withProductBrowser(async ({ container, render }) => {
        const stylesheet = document.createElement("style");
        stylesheet.textContent = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
        document.head.append(stylesheet);
        await render(React.createElement("main", { className: "storefront-frame", "data-storefront-theme": theme },
          React.createElement("section", { className: "account-page store-container" },
            React.createElement(AccountProfileForm, { mode: "update", initial: { firstName: "Ada", lastName: "Yılmaz", phone: "+905551112233", phoneVerified: true } }))));
        const frame = container.querySelector<HTMLElement>(".storefront-frame")!;
        frame.style.setProperty("--ink", ink);
        frame.style.setProperty("--paper", paper);
        frame.style.setProperty("--line", line);
        const form = container.querySelector(".storefront-frame .account-page > form")!;
        assert.equal(form.className, "account-profile-form");
        assert.equal(form.querySelectorAll(".nameFields, .field, .input, .primaryButton, .status").length, 0);
        assert.equal(form.querySelector("button")?.className, "store-button");
        assert.equal(form.querySelectorAll(".account-form-status").length, 2);
        assert.equal(form.querySelectorAll("label input").length, 3);
        assert.equal(window.getComputedStyle(form.querySelector("input")!).borderBottomColor, line);
        assert.equal(window.getComputedStyle(form.querySelector("button")!).color, paper);
        assert.equal(window.getComputedStyle(form.querySelector("button")!).backgroundColor, ink);
      });
    }
    await withProductBrowser(async ({ container, render }) => {
      await render(React.createElement(AccountProfileForm, { mode: "complete" }));
      assert.equal(container.querySelector("form")?.className, "form");
      assert.equal(container.querySelector(".account-profile-form"), null);
      assert.equal(container.querySelector('input[type="tel"]'), null);
    });
  });

  test("profile completion shows required separate names and sends no phone", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      calls.push(String(url));
      if (String(url) === "/api/account/profile/complete") {
        const body = JSON.parse(String(options?.body));
        assert.equal(body.firstName, "Ada");
        assert.equal(body.lastName, "Yılmaz");
        assert.equal(body.returnTo, "/checkout");
        assert.equal(Object.hasOwn(body, "phone"), false);
        return Response.json({ outcome: "completed", destination: "/checkout" });
      }
      return Response.json({ outcome: "profile_required" });
    };
    try {
      let hasPhoneInput = false;
      await withProductBrowser(async ({ container, render, change, click }) => {
        await render(React.createElement(AccountProfileForm, { mode: "complete", returnTo: "/checkout" }));
        hasPhoneInput = container.querySelector('input[type="tel"]') !== null;
        if (hasPhoneInput) return;
        const given = container.querySelector('input[autocomplete="given-name"]') as HTMLInputElement;
        const family = container.querySelector('input[autocomplete="family-name"]') as HTMLInputElement;
        assert.ok(given.required && family.required);
        await change('input[autocomplete="given-name"]', "Ada");
        await change('input[autocomplete="family-name"]', "Yılmaz");
        await click('button[type="submit"]');
        assert.deepEqual(calls, ["/api/account/profile/complete", "/api/account/session"]);
        assert.equal(given.value, "Ada");
        assert.equal(family.value, "Yılmaz");
      });
      assert.equal(hasPhoneInput, false, "completion cannot request the phone again");
    } finally { globalThis.fetch = originalFetch; }
  });

  test("profile update keeps the verified phone read-only and sends the profile version", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/account/profile");
      assert.deepEqual(JSON.parse(String(options?.body)).expectedVersion, 7);
      assert.equal(Object.hasOwn(JSON.parse(String(options?.body)), "phone"), false);
      return Response.json({ version: 8 });
    };
    try {
      await withProductBrowser(async ({ container, render, click }) => {
        await render(React.createElement(AccountProfileForm, { mode: "update", initial: { firstName: "Ada", lastName: "Yılmaz", phone: "+905551112233", phoneVerified: true }, version: 7 }));
        const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
        assert.ok(phone.readOnly);
        assert.equal(phone.value, "+905551112233");
        await click('button[type="submit"]');
      });
    } finally { globalThis.fetch = originalFetch; }
  });

  test("a pending profile save ignores a second click and keeps the entered names", async () => {
    let completeCalls = 0;
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/account/profile/complete") { completeCalls++; return pending; }
      return Response.json({ outcome: "profile_required" });
    };
    try {
      await withProductBrowser(async ({ container, render, change, click }) => {
        await render(React.createElement(AccountProfileForm, { mode: "complete", returnTo: "/checkout" }));
        await change('input[autocomplete="given-name"]', "Ada");
        await change('input[autocomplete="family-name"]', "Yılmaz");
        await click('button[type="submit"]');
        await click('button[type="submit"]');
        assert.equal(completeCalls, 1);
        release?.(Response.json({ outcome: "completed", destination: "/checkout" }));
        await React.act(async () => { await pending; });
        assert.equal((container.querySelector('input[autocomplete="given-name"]') as HTMLInputElement).value, "Ada");
        assert.equal((container.querySelector('input[autocomplete="family-name"]') as HTMLInputElement).value, "Yılmaz");
      });
    } finally { globalThis.fetch = originalFetch; }
  });

  test("validation rejection retains both names for correction", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ code: "invalid_input", message: "Bilgileri kontrol edin." }, { status: 400 });
    try {
      await withProductBrowser(async ({ container, render, change, click }) => {
        await render(React.createElement(AccountProfileForm, { mode: "complete" }));
        await change('input[autocomplete="given-name"]', "Ada");
        await change('input[autocomplete="family-name"]', "Yılmaz");
        await click('button[type="submit"]');
        assert.equal((container.querySelector('input[autocomplete="given-name"]') as HTMLInputElement).value, "Ada");
        assert.equal((container.querySelector('input[autocomplete="family-name"]') as HTMLInputElement).value, "Yılmaz");
        assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /Bilgileri kontrol edin/u);
      });
    } finally { globalThis.fetch = originalFetch; }
  });

  test("expired registration offers a manual phone verification link with the original target", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => String(url) === "/api/account/profile/complete"
      ? Response.json({ code: "unauthenticated", message: "Oturumunuz sona erdi." }, { status: 401 })
      : Response.json({ outcome: "unauthenticated" });
    try {
      await withProductBrowser(async ({ container, render, change, click }) => {
        await render(React.createElement(AccountProfileForm, { mode: "complete", returnTo: "/checkout" }));
        await change('input[autocomplete="given-name"]', "Ada");
        await change('input[autocomplete="family-name"]', "Yılmaz");
        await click('button[type="submit"]');
        assert.equal(container.querySelector('a[href="/account/login?returnTo=%2Fcheckout"]')?.textContent, "Telefonu yeniden doğrula");
        assert.equal((container.querySelector('input[autocomplete="given-name"]') as HTMLInputElement).value, "Ada");
      });
    } finally { globalThis.fetch = originalFetch; }
  });
}
