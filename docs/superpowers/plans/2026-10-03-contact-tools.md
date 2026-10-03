# Mağaza araçları ve iletişim balonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ortak panelden yönetilen, gerçek kanallara yönlenen iletişim balonunu bütün mağazalar için kullanılabilir yapmak.

**Architecture:** Ayrı singleton merchant kaydı mevcut session, tenant yetkisi, idempotency ve sürüm kontrolünü kullanır. PublicStorefront belge formatına dokunmadan ayrı hostname-scoped RPC, request başına bir kez okunur; tek ortak root widget bütün temalara uygulanır.

**Tech Stack:** Next.js/React/TypeScript, PostgreSQL, mevcut Mira ve storefront tema tokenları; yeni servis veya bağımlılık yok.

**Spec:** docs/superpowers/specs/2026-10-03-contact-tools.md

## Global Constraints

- İlk sürüm 9 kanal; başlangıçta kapalı; global ve kanal kapatma dolu hedeflerden bağımsız çalışır.
- Ödeme/hesap/sonuç sayfaları her zaman dışlanır; public veri tenant hostname'inden türetilir.
- Mevcut ödeme yetkileri, tasarım kayıtları, ortak Lilyum teması ve eski sözleşmeler korunur.
- Yeni görünür çalışma ekranı başlığı tekrarlanmaz; mobil modal tam ekran; 44px dokunma hedefleri.

## Review Focus

- Belirsiz ağ hatasında kaydetme tekrarı ikinci kayıt oluşturmaz; değişen body yeni anahtar kullanır.
- Bir kanalı kapatıp hedefini tutmak o kanalı public çıktıda göstermez.
- Gece yarısı geçen çalışma saati önceki günün mesaisini doğru değerlendirir.
- Özel URL ve müşteri bilgisi WhatsApp ürün bağlamına sızmaz.
- Güzide persistent layout ve tema değişimleri duplicate widget veya mobil CTA örtüşmesi üretmez.

### Task 1: Ortak sözleşme (root)

Files: packages/saas-contracts/src/contact-widget/{index,config,behavior,contact-widget.test}.ts; merchant-admin/types.ts; src/index.ts.

Interfaces: ContactWidgetConfig, createDefaultContactWidgetConfig(), parseContactWidgetConfig(unknown), normalizeContactWidgetChannelValue(type, raw), resolveContactWidgetHref(channel, config, context), contactWidgetAvailability(config, date), contactWidgetPageType(pathname), shouldShowContactWidget(config, input).

- [x] URI enjeksiyonu, boş etkin kanal, cihaz/sayfa/saat ve ürün canonical bağlamı için davranış testlerini önce yaz, eksik sözleşmeyle başarısızlığı doğrula.
- [x] Kanonik giriş parser'ı ve saf link/saat/görünürlük işlevlerini uygula; testleri geçir.

### Task 2: Tenant kayıt ve public reader (backend agent)

Files: packages/saas-data/src/merchant-admin/validation.ts; yeni public contact widget reader/export/test; apps/owner/scripts/sql/saas/202610030204_contact_widget.up.sql; apps/storefront-shared/lib/{default-runtime,page-context}.ts.

Interfaces: contact_widget merchant kind; hostname+now scoped public read config|null; page.context.contactWidget nullable config.

- [x] Kayıt yetkisi, hatalı config, aynı mağazada eşzamanlı ilk kayıt, replay, başka tenant ve unpublished contact target SQL testlerini önce çalıştır.
- [x] CHECK/dispatch/required_action/config_valid allowlist'lerini mevcut wrapper'ları koruyarak genişlet. Singleton unique/advisory lock, CAS/replay ve public grant ekle.
- [x] Ayrı public reader runtime'a bağla; eksik/bozuk widget null, mağaza açık; full ilgili paket testlerini çalıştır.

### Task 3: Mira admin editörü (UI agent)

Files: apps/customer-panel/components/settings/StoreToolsConsole.tsx + module.css; settings-navigation.ts; lib/panel-ui/navigation.ts; app/settings/store-tools/page.tsx; davranış testleri.

- [x] Uygula/Vazgeç, hatada input koruma, sabit key tekrar ve conflict reload testlerini önce yaz/RED doğrula.
- [x] Araç kütüphanesi, merkez üç sekmeli editor ve sahte olmayan önizleme uygula; etkin kanalları doğrula; role readonly.
- [x] Yeni Görünüm satırı ve navigasyonu bağla; 1440/1024/390 ve klavye doğrula.

### Task 4: Ortak storefront balonu (storefront agent)

Files: apps/storefront-shared/components/ContactWidget.tsx + module.css + test; app/layout.tsx; public product context gerektiğinde.

- [x] Global/channel disabled, route/device geçişi, gece mesaisi, Escape/focus ve ürün URL'si testlerini önce yaz/RED doğrula.
- [x] Tek mount, güvenli kanal linkleri, açık/kapalı panel, mobil safe-area ve overlay collision guard uygula.
- [x] Tema önizlemeleri ve responsive browser kabulü; gerçek mesaj gönderme.

### Task 5: İnceleme ve yayın (root + independent reviewer)

- [x] Diff/spec bağımsız review; contracts/data/panel/storefront test ve typecheck/build geçsin.
- [ ] İzole DB kabul, SQL uyumlu uygulama; son deploy kaynaklarını tekrar kontrol et.
- [ ] Storefront NET→SITE ardından panel NET→SITE yayını; aynı source SHA, değişmeyen ödeme kohortları, health kontrolleri.
- [ ] Canlı kapalı kayıt/cancel/restore kabul; QA belgesi ve görsel sonucu paylaş.
