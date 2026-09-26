# Toshi gerçek AI asistanı uygulama planı

**Goal:** Bağlı sağlayıcıyı gerçek, kayıtlı ve mağaza verisine dayanan Toshi konuşmalarında kullanmak.

**Architecture:** Mevcut sağlayıcı vault, tenant ve repository otoritesi korunur. Ayrı generation adaptörleri, PostgreSQL konuşma otoritesi, sınırlı okuma araçları ve same-origin mesaj API'si widget'a bağlanır.

**Tech Stack:** TypeScript, Next.js, PostgreSQL 16, native fetch, mevcut AEAD keyring; yeni AI framework veya vektör veritabanı yok.

**Spec:** `docs/superpowers/specs/2026-09-26-toshi-real-ai-assistant-design.md`

## Global constraints

Yeni ve mevcut dört sağlayıcı; tenant/üyelik her istekte; yalnız sunucuda credential; üç model çağrısı/altı araç/50 saniye/4096 output token; otomatize ücretli retry ve gizli fallback yok. Public metin ve kaynaklar bounded/validated. Mevcut POS/barkod/ölçü/kategori/sipariş UI ve SQL160–163 korunur. Kullanıcının sürekli uygulama/yayın yetkisiyle bağımsız işler paralel yürütülür; release öncesi birleştirilir ve bağımsız gözden geçirilir.

## Review focus

1. Anahtar revoke/rotation bir devam turunda eski credential ile yeni yanıt üretmemeli.
2. Gönderimin tekrarı, drawer kapanması veya DB commit belirsizliği ikinci ücretli çağrı üretmemeli.
3. Ürün açıklaması veya mesajdaki talimat tenant, rol veya yazma yetkisini genişletmemeli.
4. Model özel continuation blocks kaybolmamalı; unsupported/incomplete yanıt başarı gibi görünmemeli.
5. Drawer/fullscreen geçişi konuşmayı kaybetmemeli; hata kullanıcı sorusunu korumalı.

## Tasks

- [ ] **1 — Sözleşme ve kalıcılık:** `packages/saas-contracts/src/toshi/conversations.ts`, `packages/saas-data/src/toshi-conversations/*`, SQL164 up/down. Önce yanlış tenant, actor, version, replay, concurrent lease, aşırı geçmiş ve secret alanı RED testleri; sonra controlled authority ve parsers. Gerçek PG kopyasında migration, yaşam döngüsü, privacy ve rollback doğrulaması.
- [ ] **2 — Generation adaptörleri:** `apps/customer-panel/lib/toshi-generation/*`. Önce gerçek fetch boundary fixture'larıyla dört provider endpoint/header/body/tool continuation/error/bounds RED; sonra resmî protokol uygulaması ve temiz secret scope. Provider return only normalized turn result; private continuation sadece server memory.
- [ ] **3 — Mağaza araçları ve politika:** `apps/customer-panel/lib/server-toshi-chat/tools.ts`, `policy.ts`. Önce schema/unknown-tool/tenant/role/partial/currency/source tests; sonra katalog, stok, sipariş, müşteri, promosyon, satış, help/navigation facade'ları. Her tool current session ve existing data authority kullanır.
- [ ] **4 — Orchestration/runtime:** `apps/customer-panel/lib/server-toshi-chat/runtime.ts`, server registry; `server-panel-access/postgres-runtime.ts` attachment. Önce default resolution, conversation pin, actual generate, tool loop, bounds, revoked config and commit recovery RED; sonra begin/read/decrypt/generate/tools/finalize flow.
- [ ] **5 — HTTP:** `apps/customer-panel/lib/toshi-chat-http/*` ve `/api/toshi` route'ları. Önce unauthenticated/origin/privateheader/path/body/version/replay tests; sonra existing session authority + guarded message endpoint.
- [ ] **6 — Widget:** `apps/customer-panel/lib/toshi-chat-ui/client.ts`, mevcut `components/toshi/ToshiAssistant.tsx`/CSS. Önce React gerçek submit/list/history/model/status/abort/retry/localmode RED; sonra yeni endpoint'e geçiş. Drawer davranışı korunur; model metni text olarak render edilir.
- [ ] **7 — Integration/review:** hedef suites, types, gerçek PG integration, bağımsız branch review, panel ve storefront üretim build. Genel suite sonuçları mevcut baseline hatalarıyla doğru ayrılır; gerekirse somut remaining risk için test tekrarlanır.
- [ ] **8 — Release:** son diğer agent kaynağını koru; yedek + canlı migration, resmî ödeme build bindings, iki source-pinned deploy, runtime/hash/config/health, canlı sınırlı mevcut-key AI konuşması ve UI kontrolü. Test clone/owned tunnel cleanup, QA kanıt ve proje teslim kaydı; docs-only tip canlı pin değiştirmez.
