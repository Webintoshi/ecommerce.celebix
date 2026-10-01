import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";

import { componentLoader, withProductBrowser } from "../product-variant-media-test-utils.ts";

if (process.env.NODE_OPTIONS?.includes("--conditions=react-server")) {
  test("account auth browser behavior", () => {
    execFileSync(process.execPath, ["--experimental-transform-types", "--test", fileURLToPath(import.meta.url)], { env: { ...process.env, NODE_OPTIONS: "" }, stdio: "pipe" });
  });
} else {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const load = componentLoader();
  const { AccountAuthForm } = load<{ AccountAuthForm: React.ComponentType<Record<string, unknown>> }>(new URL("./AccountAuthForm.tsx", import.meta.url));
  const { AccountProfileForm } = load<{ AccountProfileForm: React.ComponentType<Record<string, unknown>> }>(new URL("./AccountProfileForm.tsx", import.meta.url));

  async function withFetch(transport: typeof fetch, run: () => Promise<void>) {
    const previous = globalThis.fetch;
    globalThis.fetch = transport;
    try { await run(); } finally { globalThis.fetch = previous; }
  }

  test("phone and email entry use POST before client JavaScript initializes", () => {
    for (const mode of ["phone", "email"]) {
      const markup = renderToStaticMarkup(React.createElement(AccountAuthForm, { mode, returnTo: "/account" }));
      const forms = markup.match(/<form\b[^>]*>/gu) ?? [];
      assert.equal(forms.length, 1, `${mode} renders one form`);
      assert.match(forms[0]!, /\bmethod="post"(?=>)/u, `${mode} must not send identity data in a GET URL`);
    }
  });

  test("code verification and resend forms use POST, including legacy browser verification", async () => {
    await withFetch(async () => Response.json({ deliveryRequired: true, retryAfterSeconds: 60 }), () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account" }));
      await change('input[type="tel"]', "5551112233");
      await click('button[type="submit"]');
      const forms = [...container.querySelectorAll("form")];
      assert.equal(forms.length, 2);
      for (const form of forms) assert.equal(form.getAttribute("method"), "post");
    }));
    await withProductBrowser(async ({ container, render }) => {
      await render(React.createElement(AccountAuthForm, { mode: "verify", returnTo: "/account", ticket: "example-ticket" }));
      for (const form of container.querySelectorAll("form")) {
        assert.equal(form.getAttribute("method"), "post");
        assert.equal(form.getAttribute("action"), "/api/account/auth/verify-browser");
      }
    });
    await withFetch(async () => Response.json({ deliveryRequired: true, retryAfterSeconds: 60 }), () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "email", returnTo: "/account" }));
      await change('input[type="email"]', "ada@example.com");
      await click('button[type="submit"]');
      assert.equal(container.querySelector("form")?.getAttribute("method"), "post");
    }));
  });

  test("single phone entry sends only canonical phone and focuses the masked WhatsApp code step", async () => {
    await withFetch(async (path, options) => {
      assert.equal(path, "/api/account/auth/start");
      assert.deepEqual(JSON.parse(String(options?.body)), { phone: "+905551112233", returnTo: "/account/orders" });
      return Response.json({ deliveryRequired: true, message: "Kod gönderildi.", retryAfterSeconds: 60 });
    }, () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account/orders" }));
      assert.equal(container.querySelector('input[autocomplete="given-name"]'), null);
      assert.equal(container.querySelector('input[autocomplete="family-name"]'), null);
      assert.equal(container.querySelector('input[type="email"]'), null);
      assert.equal(container.querySelector('[data-auth-switch]'), null);
      assert.doesNotMatch(container.textContent ?? "", /01\s*\/\s*03/u);
      assert.equal((container.querySelector('select[aria-label="Telefon ülke kodu"]') as HTMLSelectElement).value, "TR");
      await change('input[type="tel"]', "5551112233");
      await click('button[type="submit"]');
      const code = container.querySelector('input[autocomplete="one-time-code"]');
      assert.ok(code);
      assert.equal(document.activeElement, code);
      assert.match(container.textContent ?? "", /\+90 5\*\* \*\*\* 22 33/u);
      assert.match(container.textContent ?? "", /Tekrar gönder \(60/u);
      assert.doesNotMatch(container.textContent ?? "", /02\s*\/\s*03/u);
    }));
  });

  test("throttled phone starts keep customer input and show the actual retry duration", async () => {
    await withFetch(async () => Response.json({ code: "rate_limited", message: "Daha sonra deneyin.", retryAfterSeconds: 123 }, { status: 429 }), () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account" }));
      await change('input[type="tel"]', "5551112233");
      await click('button[type="submit"]');
      assert.equal(container.querySelector('input[autocomplete="one-time-code"]'), null);
      assert.equal((container.querySelector('input[type="tel"]') as HTMLInputElement).value, "5551112233");
      assert.match(container.textContent ?? "", /123 sn/u);
      assert.equal((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled, true);
    }));
  });

  test("country selection updates the visible dial code and the submitted phone", async () => {
    await withFetch(async (_path, options) => {
      assert.deepEqual(JSON.parse(String(options?.body)), { phone: "+447911123456", returnTo: "/checkout" });
      return Response.json({ deliveryRequired: true, retryAfterSeconds: 60 });
    }, () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/checkout" }));
      await change('select[aria-label="Telefon ülke kodu"]', "GB");
      assert.match(container.textContent ?? "", /\+44/u);
      await change('input[type="tel"]', "7911123456");
      await click('button[type="submit"]');
      assert.ok(container.querySelector('input[autocomplete="one-time-code"]'));
    }));
  });

  test("phone verification keeps the code after rejection and returns to the preserved phone entry", async () => {
    await withFetch(async (path, options) => {
      if (path === "/api/account/auth/start") {
        assert.deepEqual(JSON.parse(String(options?.body)), { phone: "+905551112233", returnTo: "/account" });
        return Response.json({ deliveryRequired: true, retryAfterSeconds: 60 });
      }
      assert.equal(path, "/api/account/auth/verify");
      assert.deepEqual(JSON.parse(String(options?.body)), { code: "123456", returnTo: "/account" });
      return Response.json({ message: "Kod geçersiz veya süresi dolmuş." }, { status: 400 });
    }, () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account" }));
      await change('input[type="tel"]', "5551112233");
      await click('button[type="submit"]');
      await change('input[autocomplete="one-time-code"]', "123456");
      await click('button[type="submit"]');
      assert.equal((container.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement).value, "123456");
      assert.match(container.textContent ?? "", /Kod geçersiz/u);
      await click('button[data-auth-change="phone"]');
      assert.equal(document.activeElement, container.querySelector('input[type="tel"]'));
      assert.equal((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled, true);
      assert.equal((container.querySelector('input[type="tel"]') as HTMLInputElement).value, "5551112233");
    }));
  });

  test("phone code verification follows the exact server destination including required profile completion", async () => {
    for (const destination of ["/checkout", "/account/profile"]) {
      await withFetch(async (path) => path === "/api/account/auth/start"
        ? Response.json({ outcome: "accepted", deliveryRequired: true, retryAfterSeconds: 60, returnTo: "/checkout" })
        : Response.json({ outcome: "authenticated", profileRequired: destination === "/account/profile", destination }), () => withProductBrowser(async ({ container, render, change, click }) => {
        let navigated = "";
        window.location.assign = (value) => { navigated = String(value); };
        await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/checkout" }));
        await change('input[type="tel"]', "5551112233");
        await click('button[type="submit"]');
        await change('input[autocomplete="one-time-code"]', "123456");
        await click('button[type="submit"]');
        assert.equal(navigated, destination);
        assert.equal((container.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement).disabled, true);
      }));
    }
  });

  test("same-render submissions start only one request and disable every sign in control until settled", async () => {
    let requests = 0;
    let resolve!: (response: Response) => void;
    await withFetch(async () => { requests += 1; return new Promise<Response>((done) => { resolve = done; }); }, () => withProductBrowser(async ({ container, render, change }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account" }));
      await change('input[type="tel"]', "5551112233");
      const form = container.querySelector("form")!;
      await React.act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
      assert.equal(requests, 1);
      assert.equal(form.getAttribute("aria-busy"), "true");
      for (const control of container.querySelectorAll("input, button")) assert.equal((control as HTMLInputElement | HTMLButtonElement).disabled, true);
      await React.act(async () => resolve(Response.json({ outcome: "accepted", deliveryRequired: true, retryAfterSeconds: 60, returnTo: "/account" })));
      assert.equal(document.activeElement, container.querySelector('input[autocomplete="one-time-code"]'));
    }));
  });

  test("a successful HTTP response without delivery does not claim a WhatsApp code was sent", async () => {
    await withFetch(async () => Response.json({ deliveryRequired: false, retryAfterSeconds: 60 }), () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account" }));
      await change('input[type="tel"]', "5551112233");
      await click('button[type="submit"]');
      assert.equal(container.querySelector('input[autocomplete="one-time-code"]'), null);
      assert.match(container.textContent ?? "", /Kod gönderilemedi/u);
    }));
  });

  test("resend refusal preserves the code and uses elapsed cooldown after returning from a background tab", async () => {
    const originalNow = Date.now;
    let time = 1_000;
    let starts = 0;
    Date.now = () => time;
    try {
      await withFetch(async () => ++starts === 1
        ? Response.json({ outcome: "accepted", deliveryRequired: true, retryAfterSeconds: 60, returnTo: "/account" })
        : Response.json({ code: "rate_limited", message: "Yeni kod istemeden önce lütfen bekleyin.", retryAfterSeconds: 123 }, { status: 429 }), () => withProductBrowser(async ({ container, render, change, click }) => {
        await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account" }));
        await change('input[type="tel"]', "0452 606 05 52");
        await click('button[type="submit"]');
        await change('input[autocomplete="one-time-code"]', "12x3 45-6");
        assert.equal((container.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement).value, "123456");
        assert.equal((container.querySelector("button.secondaryButton") as HTMLButtonElement).disabled, true);
        time = 61_000;
        await React.act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
        assert.equal((container.querySelector("button.secondaryButton") as HTMLButtonElement).disabled, false);
        await click("button.secondaryButton");
        assert.equal(starts, 2);
        assert.equal((container.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement).value, "123456");
        assert.equal(document.activeElement, container.querySelector('input[autocomplete="one-time-code"]'));
        assert.match(container.textContent ?? "", /123 sn/u);
        assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /bekleyin/u);
      }));
    } finally { Date.now = originalNow; }
  });

  test("verified account phone is read only and explains its account sign in role", async () => {
    await withProductBrowser(async ({ container, render }) => {
      await render(React.createElement(AccountProfileForm, { mode: "update", initial: { firstName: "Ada", lastName: "Yılmaz", phone: "+905551112233", phoneVerified: true } }));
      const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
      assert.equal(phone.readOnly, true);
      assert.match(container.textContent ?? "", /Doğrulanmış/u);
      assert.match(container.textContent ?? "", /giriş/u);
    });
  });

  test("saving verified phone profiles omits identity phone and uses the new server version for the next save", async () => {
    let saves = 0;
    await withFetch(async (path, options) => {
      assert.equal(path, "/api/account/profile");
      const body = JSON.parse(String(options?.body));
      assert.equal(Object.hasOwn(body, "phone"), false);
      assert.equal(body.expectedVersion, 7 + saves);
      assert.equal(body.firstName, "Ada");
      assert.equal(body.lastName, "Yılmaz");
      assert.match(body.operationId, /^[0-9a-f-]{36}$/u);
      saves += 1;
      return Response.json({ outcome: "updated", version: 7 + saves, replayed: false });
    }, () => withProductBrowser(async ({ container, render, click }) => {
      await render(React.createElement(AccountProfileForm, { mode: "update", version: 7, initial: { firstName: "Ada", lastName: "Yılmaz", phone: "+905551112233", phoneVerified: true } }));
      await click('button[type="submit"]');
      assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /kaydedildi/u);
      await click('button[type="submit"]');
      assert.equal(saves, 2);
    }));
  });

  test("profile saving is serialized and freezes visible fields while the mutation is pending", async () => {
    let saves = 0;
    let resolve!: (response: Response) => void;
    await withFetch(async () => { saves += 1; return new Promise<Response>((done) => { resolve = done; }); }, () => withProductBrowser(async ({ container, render }) => {
      await render(React.createElement(AccountProfileForm, { mode: "update", initial: { firstName: "Ada", lastName: "Yılmaz", phone: "+905551112233", phoneVerified: true } }));
      const form = container.querySelector("form")!;
      await React.act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
      assert.equal(saves, 1);
      assert.equal(form.getAttribute("aria-busy"), "true");
      for (const control of container.querySelectorAll("input, button")) assert.equal((control as HTMLInputElement | HTMLButtonElement).disabled, true);
      await React.act(async () => resolve(Response.json({ outcome: "updated", version: 2, replayed: false })));
      assert.equal((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled, false);
    }));
  });

  test("email fallback hides WhatsApp and keeps legacy email account access", async () => {
    await withFetch(async (path, options) => {
      assert.equal(path, "/api/account/auth/start");
      assert.deepEqual(JSON.parse(String(options?.body)), { email: "ada@example.com", returnTo: "/account" });
      return Response.json({ deliveryRequired: true, retryAfterSeconds: 60 });
    }, () => withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "email", returnTo: "/account" }));
      assert.equal(container.querySelector('input[type="tel"]'), null);
      assert.doesNotMatch(container.textContent ?? "", /WhatsApp/u);
      assert.match(container.textContent ?? "", /Güvenilir Giriş/u);
      await change('input[type="email"]', "ada@example.com");
      await click('button[type="submit"]');
      assert.match(container.textContent ?? "", /E-postanı kontrol et/u);
      assert.match(container.textContent ?? "", /ad\*\*\*@example.com/u);
      assert.equal(document.activeElement?.textContent, "E-postanı kontrol et");
    }));
  });

  test("secondary email access retains the phone entry when returning", async () => {
    await withProductBrowser(async ({ container, render, change, click }) => {
      await render(React.createElement(AccountAuthForm, { mode: "phone", returnTo: "/account" }));
      await change('input[type="tel"]', "5551112233");
      await click('button.emailAlternative');
      assert.ok(container.querySelector('input[type="email"]'));
      assert.equal(document.activeElement, container.querySelector('input[type="email"]'));
      await click('button.textButton');
      assert.equal(document.activeElement, container.querySelector('input[type="tel"]'));
      assert.equal((container.querySelector('input[type="tel"]') as HTMLInputElement).value, "5551112233");
    });
  });

  test("legacy email ticket confirmation still submits to its browser verification route", async () => {
    await withProductBrowser(async ({ container, render }) => {
      await render(React.createElement(AccountAuthForm, { mode: "verify", returnTo: "/account/orders", ticket: "example-ticket" }));
      const form = container.querySelector("form");
      assert.equal(form?.getAttribute("action"), "/api/account/auth/verify-browser");
      assert.equal(form?.getAttribute("method"), "post");
      assert.equal((form?.querySelector('input[name="ticket"]') as HTMLInputElement).value, "example-ticket");
      assert.equal((form?.querySelector('input[name="returnTo"]') as HTMLInputElement).value, "/account/orders");
      assert.equal(container.querySelector('input[autocomplete="one-time-code"]')?.getAttribute("maxlength"), "6");
    });
  });
}
