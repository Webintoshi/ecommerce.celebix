# Sepet ve ödeme önerileri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mağaza Araçları üzerinden yönetilen ortak sepet/checkout tamamlayıcı ürün önerileri.
**Architecture:** Yeni bağımsız ayar sözleşmesi ve private native tablolar. Opsiyonel öneri GET'i salt okunur; ürün ekleme ve fiyat/indirim hesabı mevcut cart/quote motorundan geçer.
**Tech Stack:** TypeScript, Next.js/React, Postgres, mevcut node:test ve browser fixture araçları.
**Spec:** docs/superpowers/specs/2026-10-09-order-bump-tools-design.md

## Global Constraints

- Varsayılan kapalı, en fazla 20 kural, her kural 20 ürün/20 kategori/6 varyant, en fazla 3 öneri.
- TRY kuruş, sunucu fiyat otoritesi; promosyon/ödeme/stok motorunun sözleşmesi korunur.
- Kaydet gerçek etki; ek taslak/yayın yok. Hata sonrası form korunur.
- Gerçek host/session tenant otoritesi, configuration.read/manage, CAS ve idempotent replay.
- Mevcut mühürlü release kitleri değiştirilemez; tek publisher root/Cemo.

## Review Focus

1. Eski gram fiyatı taşıyan sepet: güncel fiyatla öneri gösterip eski tutarla ödeme başlatmamalı.
2. İki oturumun ayar kaydı: eski sürüm sessizce ezilmemeli; tekrar aynı sonucu dönmeli.
3. Ekleme yanıtı kaybolması: bir ürün iki kez eklenmemeli; ödeme eski digest'le gönderilmemeli.
4. Buy-now veya sağlayıcı sayfası: öneri başka bir sepete eklenmemeli.
5. Yetki/seçenek okuma hatası: diğer araçlar ve mevcut sepet/ödeme kullanılabilir kalmalı.

### Task 1: Contracts, data and native

**Files:** packages/saas-contracts/src/order-bumps/*; packages/saas-data/src/order-bumps/*; package index exports; new additive native migration/assertions/native harness.
**Interfaces:** Spec'teki public TS türleri; parseOrderBumpSettings, createDefaultOrderBumpSettings, parseOrderBumpWorkspace, parseOrderBumpOptionsPage, parseOrderBumpPublicOffers. PostgresOrderBumpAdminRepository get({tenantContext,now}), save({tenantContext,now,operationId,expectedVersion,config}), options({tenantContext,now,kind,page,search?,productId?,ids?}). PostgresPublicOrderBumpRepository offers({hostname,now,credentialCandidates,placement}).
- [ ] Contract ve repository başarısız davranış testlerini yaz/çalıştır: sınırlar, drift ve cross-tenant, işlem/commit belirsizliği.
- [ ] Bağımsız tablo/fonksiyonları ve TS repository'yi uygula; aktif kaynaklar native'de doğrulansın.
- [ ] İzole native tests, gerçek eşzamanlı CAS/replay ve rollback kabulünü çalıştır; önceki şema/veri korumasını kanıtla.
- [ ] Sözleşme ve veri typecheck/tests, diff check.

### Task 2: Admin HTTP/runtime integration

**Files:** apps/customer-panel/lib/order-bumps-http/*; lib/server-order-bumps/*; app/api/order-bumps/*; server runtime registration.
**Interfaces:** GET {workspace}, POST {expectedVersion,config} → {workspace}; options GET kind/page/search/productId/ids → {options}. Mutation header Idempotency-Key.
- [ ] Mevcut authorization/origin/session/strict query ve body davranışlarıyla failing HTTP testleri.
- [ ] Runtime kayıt ve handlers; 0 sürüm ilk kaydı kabul eder; belirsiz repository sonucu 503, bilinen conflict 409.
- [ ] Tüm focused tests ve mevcut engagement/merchant-admin HTTP regresyonları.

### Task 3: Merchant editor

**Files:** components/settings/OrderBumpTool.tsx, artwork/CSS/behavior tests; lib/order-bumps-ui/client.ts/tests; StoreToolsConsole entry/open-state integration.
**Interfaces:** Task 2 API ve Task 1 parsers; configuration-only erişimle paged ürün/kategori/varyant seçenekleri.
- [ ] Kullanıcı davranışlarını önce test et: kaydet, kural kaldır/sırala, seçili varyantlar, çakışma, aynı key tekrar, dirty çıkış ve salt okunur.
- [ ] Mevcut ayar ve modal primitive'leriyle compact editor/önizleme; Uygula tek gerçek kayıt.
- [ ] 1440/1024/390 browser screenshots, overflow/focus/Escape/error data preservation; mevcut tools davranış testleri.

### Task 4: Shared storefront and checkout

**Files:** lib/order-bumps/*; components/OrderBumpOffers.tsx/CSS/tests; SideCartDrawer.tsx; SioraSideCartDrawer.tsx; CheckoutForm.tsx; app/api/order-bumps/route.ts; public runtime registry.
**Interfaces:** GET placement → public projection; existing add(expectedVersion) → canonical PublicCart; replaceCart and serialized quote queue.
- [ ] Failing davranış testleri: opsiyonel GET hatası, stale response, tek ekleme, belirsiz ekleme sonucu, quote/submit fencing, retained form/coupon and fresh operation.
- [ ] Öneriler iki drawer'da ve cart-intent checkout'ta; payment/buy-now hariç.
- [ ] Eklemeyi synchronous guard'la kilitle; fiyat hesaplama yok; ekleme sonrası canonical cart+quote yenile.
- [ ] Cart/checkout/hosted-payment regresyonları ve storefront build.

### Task 5: Review and shared release

- [ ] Bağımsız code/security/UX review; somut riskleri düzelt.
- [ ] Tek sırada build; yeterli disk ve mevcut dependency reuse. Önceden kırık full-suite sonuçlarını yeni regresyondan ayır ve raporla.
- [ ] Güncel source/native/queue/pin baseline, yedek ve rollback proof; additive schema onaylı scope ile uygula.
- [ ] Ortak storefront ve NET → SITE panel rollout; exact running source ve mevcut özelliklerin korunması.
- [ ] Sahte finans hareketi olmadan live API/UI kabul; kısa kullanıcı özeti ve gerekli sınırlar.
