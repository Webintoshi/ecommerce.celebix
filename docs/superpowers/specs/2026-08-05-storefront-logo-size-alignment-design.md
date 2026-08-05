# Storefront Logo Size and Alignment Design

Status: Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Mağaza yöneticisi, mevcut tasarım çalışma alanından storefront logosunun boyutunu ve yatay hizasını mağaza-bazlı olarak seçebilmeli. Seçim admin önizlemesinde hemen görünmeli ve yalnız mevcut taslak/yayınlama akışıyla canlı storefront'a taşınmalı.

## Kullanıcı sözleşmesi

- Logo boyutu: `small`, `medium`, `large`, `xlarge`.
- Türkçe etiketler: Küçük, Orta, Büyük, Çok büyük.
- Logo hizası: `left`, `center`.
- Türkçe etiketler: Sola yasla, Ortala.
- Varsayılan: `medium` ve `center`.
- Logo yoksa mağaza adı mevcut davranışla gösterilmeye devam eder.

## Mimari

İki alan, `StarterThemeVisualV2` ve yayımlanmış `PublicStarterThemePresentationV3.visual` içinde taşınır. Ayrı localStorage, query, cookie veya browser tenant otoritesi oluşturulmaz. Mevcut taslak kaydetme ve `Yayınla` işlemi tek kalıcı yetki kaynağı olmaya devam eder.

Mevcut schema-v2 composition ve schema-v3 presentation kayıtları bozulmaz. Parser, iki yeni alanı geriye uyumlu olarak isteğe bağlı kabul eder; eksik alanları `medium` ve `center` değerlerine normalize eder. Yeni veya tekrar kaydedilen belgeler canonical iki alanı içerir. Bilinmeyen değerler `storefront_contract_invalid` ile reddedilir.

## Admin deneyimi

`StarterThemeComposer` içindeki Görsel sistem paneline iki select eklenir:

1. Logo boyutu: Küçük / Orta / Büyük / Çok büyük.
2. Logo hizası: Sola yasla / Ortala.

Değişiklikler mevcut immutable `patch` akışından geçer. `StarterThemePreview` aynı canonical değerleri sınıf veya data attribute olarak uygular; ayrı bir önizleme modeli oluşturulmaz.

## Storefront render

`CampaignHeader` canonical `presentation.visual` alanlarını `CampaignHeaderClient` bileşenine geçirir. Header kökünde veya wordmark üzerinde finite data attribute kullanılır. CSS yalnız bu finite değerlerden boyut ve hizalama üretir.

Masaüstü hedefleri:

- `small`: 32px logo yüksekliği.
- `medium`: 46px logo yüksekliği.
- `large`: 60px logo yüksekliği.
- `xlarge`: 76px logo yüksekliği.

Genişlik her zaman `auto` olur ve güvenli max-width ile sınırlandırılır; logo kırpılmaz. Sol hizalama wordmark hücresinin başına, orta hizalama ortasına uygulanır. Mobilde seçilen boyut korunmaya çalışılır fakat header ve 48px etkileşim hedeflerinin taşmaması için yüksekliğe ve genişliğe responsive üst sınır uygulanır.

## Güvenlik ve geriye uyumluluk

- Tasarım otoritesi yalnız durable, yayımlanmış presentation'dır.
- Request header, Host, query, cookie veya client state bu ayarları belirleyemez.
- Eski kayıtlar defaults ile açılır; migration gerekmez.
- `apps/admin/**` değiştirilmez.
- Production deploy veya production credential değişikliği yapılmaz.

## Test stratejisi

1. Contract RED/GREEN: dört boyut ve iki hizalama kabul edilir; bilinmeyen değerler reddedilir; eski payload defaults ile normalize edilir.
2. Composer RED/GREEN: sekiz Türkçe seçenek ve immutable patch bağlantısı kanıtlanır.
3. Preview RED/GREEN: seçilen boyut/hizalama data attribute veya sınıfa dönüşür.
4. Storefront RED/GREEN: `CampaignHeader` yayımlanmış değerleri geçirir; client/CSS dört boyut ve iki hizalamayı uygular.
5. Negatif güvenlik: browser/env/tenant authority eklenmediği static testlerle korunur.
6. Regresyon: customer-panel ve storefront test, typecheck, build; `git diff --check`.

## Yayın ve kabul

Kod ayrı review edilebilir commit'lerle mevcut feature branch'e gönderilir. Yalnız customer-panel ve storefront staging aynı exact SHA ile yayınlanır. Canlı kabulte admin seçenekleri, yayımlama sonrası logo boyutu/hizası, mobil taşma ve mevcut banner/header davranışı doğrulanır.
