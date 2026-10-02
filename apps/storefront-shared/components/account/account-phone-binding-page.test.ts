import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { accountProfileDestination } from "../../lib/account/account-page-decision.ts";
import { safeAccountReturnTo } from "../../lib/account/request.ts";
import { componentLoader } from "../product-variant-media-test-utils.ts";

const PHONE = "+905551112233";
const BINDING_PATH = "/account/profile/verify-phone";

class Redirect extends Error {
  readonly destination: string;
  constructor(destination: string) {
    super(`Redirect: ${destination}`);
    this.destination = destination;
  }
}

function Placeholder() { return null; }
function AuthForm() { return null; }

type Scenario = Readonly<{
  outcome?: "found" | "profile_required" | "unauthenticated";
  whatsappEnabled?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
}>;

function pages(scenario: Scenario = {}) {
  const requests: unknown[][] = [];
  const profile = {
    email: "ada@example.test", firstName: "Ada", lastName: "Lovelace",
    phone: Object.hasOwn(scenario, "phone") ? scenario.phone : PHONE,
    ...(scenario.phoneVerified !== undefined ? { phoneVerified: scenario.phoneVerified } : {}),
  };
  const outcome = scenario.outcome ?? "found";
  const context = {
    storefront: { hostname: "fixture.invalid", name: "Fixture" }, design: null,
    identity: { whatsappEnabled: Object.hasOwn(scenario, "whatsappEnabled") ? scenario.whatsappEnabled : true },
    session: outcome === "found"
      ? { outcome, snapshot: { status: "active", version: 7, profile, addresses: [], favorites: [], devices: [] } }
      : { outcome },
  };
  const load = componentLoader({
    "next/navigation": { redirect: (destination: string) => { throw new Redirect(destination); } },
    "next/link": { __esModule: true, default: Placeholder },
    "@/components/account/AccountAuthForm": { AccountAuthForm: AuthForm },
    "@/components/account/AccountAuthShell": { AccountAuthShell: Placeholder },
    "@/components/account/AccountProfileForm": { AccountProfileForm: Placeholder },
    "@/components/account/AccountNav": { AccountNav: Placeholder },
    "@/components/StorefrontFrame": { StorefrontFrame: Placeholder },
    "@/lib/account/account-page-decision.ts": { accountProfileDestination },
    "@/lib/account/request.ts": { safeAccountReturnTo },
    "@/lib/account/page.ts": { resolveAccountPage: async (...arguments_: unknown[]) => {
      requests.push(arguments_);
      return context;
    } },
  });
  return {
    requests,
    binding: () => load<{ default: () => Promise<React.ReactNode> }>(new URL("../../app/account/profile/verify-phone/page.tsx", import.meta.url)).default(),
    profile: () => load<{ default: (input: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactNode> }>(new URL("../../app/account/profile/page.tsx", import.meta.url)).default({ searchParams: Promise.resolve({}) }),
  };
}

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}

test("phone binding page uses the authenticated profile phone and returns to that profile", async () => {
  const selected = pages();
  const rendered = elements(await selected.binding());
  const forms = rendered.filter((element) => element.type === AuthForm);
  assert.equal(forms.length, 1);
  assert.deepEqual(forms[0]!.props, { mode: "phone-binding", initialPhone: "+905551112233", returnTo: "/account/profile" });
  assert.deepEqual(selected.requests, [["/account/profile"]]);
});

for (const [name, scenario] of [
  ["an unauthenticated session", { outcome: "unauthenticated" }],
  ["a pending registration", { outcome: "profile_required" }],
  ["WhatsApp disabled", { whatsappEnabled: false }],
  ["WhatsApp unavailable", { whatsappEnabled: undefined }],
  ["an absent profile phone", { phone: undefined }],
  ["a missing profile phone", { phone: null }],
  ["an empty profile phone", { phone: "" }],
  ["an already verified phone", { phoneVerified: true }],
] as const) {
  test(`phone binding page redirects to profile for ${name}`, async () => {
    const selected = pages(scenario);
    await assert.rejects(selected.binding, (error: unknown) => error instanceof Redirect && error.destination === "/account/profile");
  });
}

test("profile offers phone verification only for an enabled, unverified profile phone", async () => {
  for (const [scenario, expectedLinks] of [
    [{}, 1],
    [{ phoneVerified: true }, 0],
    [{ whatsappEnabled: false }, 0],
    [{ whatsappEnabled: undefined }, 0],
    [{ phone: undefined }, 0],
    [{ phone: null }, 0],
    [{ phone: "" }, 0],
    [{ outcome: "profile_required" }, 0],
    [{ outcome: "unauthenticated" }, 0],
  ] as readonly (readonly [Scenario, number])[]) {
    const selected = pages(scenario);
    const rendered = elements(await selected.profile());
    const links = rendered.filter((element) => element.props.href === BINDING_PATH);
    assert.equal(links.length, expectedLinks, JSON.stringify(scenario));
  }
});
