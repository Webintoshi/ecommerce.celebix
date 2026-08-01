import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("composer source contains no raw store or tenant authority", async () => { const value = await source("StarterThemeComposer.tsx"); assert.doesNotMatch(value, /storeId|tenantId|x-forwarded|localStorage|sessionStorage/); assert.match(value, /credentials:\s*"same-origin"/); });
test("composer loads durable draft and active composition", async () => { const value = await source("StarterThemeComposer.tsx"); assert.match(value, /merchantAdminApi[.]records\("starter_theme_composition"\)/); assert.match(value, /Taslak|draft/); });
test("composer loads canonical category product and R2 asset pickers", async () => { const value = await source("StarterThemeComposer.tsx"); for (const token of ["catalogOnboardingClient.listCategories", "catalogApi.listProducts", "/api/storefront-assets", "parseStorefrontAsset"]) assert.match(value, new RegExp(token.replace(/[().]/g, "\\$&"))); });
test("composer exposes truthful loading empty error conflict and saved states", async () => { const value = await source("StarterThemeComposer.tsx"); for (const token of ["Yükleniyor", "Henüz", "yüklenemiyor", "version_conflict", "Kaydedildi"]) assert.match(value, new RegExp(token)); });
test("composer preserves disabled role authority", async () => { const value = await source("StarterThemeComposer.tsx"); assert.match(value, /disabled=\{!canManage/); assert.match(value, /Yalnız görüntüleme/); });
test("composer has distinct draft and publish actions with optimistic version", async () => { const value = await source("StarterThemeComposer.tsx"); assert.match(value, /Taslak kaydet/); assert.match(value, /Yayınla/); assert.match(value, /expectedVersion:\s*current[.]version/); });
test("section order works without drag and has accessible labels", async () => { const value = await source("StarterThemeComposer.tsx"); assert.match(value, /moveStarterSection/); assert.match(value, /yukarı taşı/); assert.match(value, /aşağı taşı/); });
test("composer provides bounded visual product detail and cart controls", async () => { const value = await source("StarterThemeComposer.tsx"); for (const token of ["Renk paleti", "Başlık stili", "Ürün detayı", "Sepet deneyimi"]) assert.match(value, new RegExp(token)); });
test("preview consumes parsed composition and offers responsive modes", async () => { const value = await source("StarterThemePreview.tsx"); assert.match(value, /desktop/); assert.match(value, /mobile/); assert.match(value, /presentation/); });
test("theme page is server-authorized and passes only role capability", async () => { const value = await source("../../app/settings/theme/page.tsx"); assert.match(value, /requireServerPanelAccess\(\)/); assert.match(value, /configuration[.]manage/); assert.match(value, /StarterThemeComposer/); assert.doesNotMatch(value, /tenantContext=|storeId=|membershipId=/); });
