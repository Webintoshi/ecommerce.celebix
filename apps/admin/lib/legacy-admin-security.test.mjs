import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { legacyAdminApiScope, legacyAdminRoleAllowed } from "./legacy-admin-api-policy.ts";
import {
    redactEmailSettings,
    redactSecretFields,
    restoreEmailSettings,
    restoreSecretFields,
    STORED_SECRET,
} from "./legacy-settings-secrets.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the legacy middleware applies the API policy and leaves asset response CSP to the route", () => {
    const middleware = source("../middleware.ts");
    assert.match(middleware, /legacyAdminApiScope\(pathname, request\.method\)/);
    assert.match(middleware, /contentSecurityPolicy: "route-owned"/);
});

test("legacy customer linking uses the verified session identity", () => {
    const route = source("../app/api/customers/create-from-auth/route.ts");
    assert.match(route, /supabase\.auth\.getUser\(/);
    assert.match(route, /user\.email_confirmed_at/);
    assert.match(route, /user_id: user\.id/);
    assert.match(route, /\.is\("user_id", null\)/);
});

test("legacy reset uses a privileged write operation and explicit confirmation", () => {
    const route = source("../app/api/admin/seed/route.ts");
    assert.match(route, /export async function POST/);
    assert.match(route, /requireLegacyAdminApi\(request, "settings"\)/);
    assert.match(route, /confirmation !== true/);
    assert.doesNotMatch(route, /export async function GET|SEED_SECRET/);
});

test("legacy payment management resolves retained credentials only on the server", () => {
    const route = source("../app/api/admin/payments/route.ts");
    assert.match(route, /requireLegacyAdminApi\(request, "settings"\)/);
    assert.match(route, /redactPaymentGateway/);
    assert.match(route, /restorePaymentGatewayCredentials/);
});


test("legacy order managers keep their assigned routes and settings stay with super admins", () => {
    for (const path of ["/api/orders", "/api/abandoned-carts/", "/api/customers", "/api/lucky-wheel/admin"]) {
        const scope = legacyAdminApiScope(path, "GET");
        assert.equal(scope, "orders");
        assert.equal(legacyAdminRoleAllowed("order_manager", scope), true);
        assert.equal(legacyAdminRoleAllowed("content_creator", scope), false);
    }

    for (const path of ["/api/admin/payments", "/api/admin/seed", "/api/migrate"]) {
        const scope = legacyAdminApiScope(path, "POST");
        assert.equal(scope, "settings");
        assert.equal(legacyAdminRoleAllowed("super_admin", scope), true);
        assert.equal(legacyAdminRoleAllowed("order_manager", scope), false);
    }
});

test("legacy dashboard data is private while public storefront routes remain reachable", () => {
    for (const path of ["/api/analytics/dashboard", "/api/analytics/heartbeat", "/api/analytics/ga4", "/api/analytics/live"]) {
        assert.equal(legacyAdminApiScope(path, "GET"), "admin");
        assert.equal(legacyAdminApiScope(path, "HEAD"), "admin");
    }

    assert.equal(legacyAdminApiScope("/api/products", "GET"), "admin");
    assert.equal(legacyAdminApiScope("/api/analytics/heartbeat", "POST"), null);
    assert.equal(legacyAdminApiScope("/api/customers/create-from-auth", "POST"), null);
    assert.equal(legacyAdminApiScope("/api/public/payments", "GET"), null);
    assert.equal(legacyAdminApiScope("/api/homepage", "GET"), null);
});

test("masked settings retain a stored value or accept a replacement", () => {
    const credentials = { merchantId: "merchant-123", merchantKey: "saved-test-credential", merchantSalt: "" };
    const secretFields = ["merchantKey", "merchantSalt"];
    const masked = redactSecretFields(credentials, secretFields);
    assert.deepEqual(masked, { merchantId: "merchant-123", merchantKey: STORED_SECRET, merchantSalt: "" });
    assert.deepEqual(restoreSecretFields(masked, credentials, secretFields), credentials);
    assert.equal(restoreSecretFields({ ...masked, merchantKey: "replacement" }, credentials, secretFields).merchantKey, "replacement");
    assert.equal(restoreSecretFields(masked, undefined, secretFields).merchantKey, "");
});

test("a stored mail credential stays with its provider", () => {
    const current = { provider: "smtp", password: "test-password", senderEmail: "sender@example.com", senderName: "Store" };
    const masked = redactEmailSettings(current);
    assert.equal(masked.password, STORED_SECRET);
    assert.equal(restoreEmailSettings(masked, current).password, "test-password");
    assert.equal(restoreEmailSettings({ ...masked, provider: "resend" }, current).password, undefined);
});
