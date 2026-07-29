# Pilot Plan Assignment Authority Design

Status: Kullanıcının “hepsini yap” yazılı yetkisiyle onaylandı.

## Amaç

`free_starter v1` planının immutable 100 ürün sınırını değiştirmeden, gerçek pilot mağazaların 2.000 ürüne kadar güvenli katalog göçü yapabilmesini sağlayan immutable `pilot v1` planını ve yalnız bootstrap rolünün kullanabildiği atomik plan-atama yetkisini eklemek.

## Değişmez sınırlar

- `free_starter v1`, mevcut plan özellikleri, limitleri ve kayıt akışı değişmeyecek.
- Uygulama rolü plan oluşturamayacak, değiştiremeyecek veya abonelik atayamayacak.
- Tarayıcı, cookie, header, mağaza slug’ı veya istemci gövdesi plan yetkisi olmayacak.
- Güzide’ye özgü kimlik, slug veya credential kaynak koduna girmeyecek.
- Production verisi, credential’ı, deploy’u, DNS’i ve müşteri domain’i değişmeyecek.
- Plan ataması doğrudan tablo yazımıyla değil, bootstrap rolüne kapalı uçlu bir SQL fonksiyonuyla yapılacak.

## Immutable `pilot v1`

Deterministik plan kimliği `00000000-0000-4000-8000-000000000002`, plan kodu `pilot`, sürüm `1` ve başlangıç zamanı `2026-07-29T00:00:00.000Z` olacak.

On üç mevcut özellik anahtarı aynı ordinal sırasıyla etkin olacak. Limitler:

- `products`: `2000`
- `staff`: `5`
- `storageBytes`: `10000000000`
- `monthlyOrders`: `10000`
- `customDomains`: `1`

Seed ilk uygulamada planı, özellikleri ve limitleri ekleyecek. Yeniden uygulamada yalnız exact snapshot’ı doğrulayacak; drift varsa işlemi durduracak. Mevcut `plan_features_immutable` ve `plan_limits_immutable` trigger’ları yalnız aynı transaction içinde seed eklemesi için geçici kapatılıp her durumda transaction ile geri alınabilir biçimde yeniden etkinleştirilecek.

## Plan-atama yetkisi

```sql
saas.assign_store_plan(
  p_store_id uuid,
  p_expected_subscription_id uuid,
  p_expected_plan_code text,
  p_expected_plan_version bigint,
  p_target_subscription_id uuid,
  p_target_plan_code text,
  p_target_plan_version bigint,
  p_now timestamptz
) RETURNS TABLE(outcome text, result_payload jsonb)
```

Fonksiyon `SECURITY DEFINER`, sabit `search_path=pg_catalog,saas` ve yalnız `celebix_saas_bootstrap` EXECUTE yetkisiyle çalışacak. Önce mağazayı, sonra aktif aboneliği row lock altında doğrulayacak. Beklenen abonelik kimliği/kodu/sürümü uyuşmazsa hiçbir yazma yapmayacak. Hedef planın exact aktif ve zaman bakımından geçerli snapshot’ı bulunmadan yazmayacak.

Başarılı işlemde mevcut abonelik `inactive` yapılacak ve aynı transaction içinde yeni exact hedef abonelik `active` olarak eklenecek. Aynı hedef abonelik kimliğiyle exact tekrar çağrısı `operation_replayed`; farklı payload `operation_mismatch` döndürecek. Aynı planı yeniden atama `plan_unchanged` ile reddedilecek.

## Güvenlik ve hata davranışı

Sonuç payload’ı yalnız store, önceki/yeni abonelik kimlikleri ve hedef plan kimliği/kodu/sürümünü içerecek. E-posta, credential, session, DB URL veya secret içermeyecek. Uygulama, identity, resolver ve public rollerin EXECUTE yetkisi olmayacak. Yanlış mağaza, yanlış mevcut abonelik, eksik/hedefi geçersiz plan ve yarış kaybeden çağrı fail-closed olacak.

## Test ve staging akışı

Disposable PostgreSQL 16 testleri seed/reapply/drift, grant matrisi, yanlış beklenen abonelik, geçersiz hedef, replay/mismatch, eşzamanlı tek kazanan, rollback/reapply ve cleanup davranışını kanıtlayacak. Static testler manifest checksum’larını, exact snapshot’ı ve SECURITY DEFINER/search_path/grant sınırını doğrulayacak.

Testlerden sonra migration yalnız staging PostgreSQL’e uygulanacak. Güzide mağazasının mevcut exact aktif aboneliği read-only bulunacak; bootstrap fonksiyonu tek kez çağrılacak. Mevcut panel session sonraki istekte durable aboneliği yeniden çözümlediği için cookie veya session değiştirilmeyecek. Ardından aynı WooCommerce dosyasıyla 1.628 ürün ve 5.423 medya aktarımı devam ettirilecek.

