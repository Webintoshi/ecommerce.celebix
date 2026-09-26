# Toshi: gerçek mağaza asistanı

## Amaç ve mevcut hata

Kullanıcı bağlı API anahtarıyla doğal dilde soru sorabilmeli; Toshi mevcut mağazanın yetkili verilerinden doğru yanıt üretmeli, devam sorularını anlamalı ve panel kullanımında yardımcı olmalıdır. Mevcut bileşen yalnız `parseToshiLocalIntent` ve tarayıcı GET komutlarını kullanıyor; sağlayıcıya model çağrısı yapmıyor. Bu çalışma 2026-08-02 tarihli onaylı BYOK tasarımının konuşma bölümünü tamamlar ve DeepSeek'i kapsar. Kullanıcı uygulama ve yayın için mevcut oturumda açık, sürekli yetki vermiştir.

## Mimari

- Sunucuda aynı mağaza/üyelik otoritesi; model veya istemci tenant, rol ya da veri kaynağı seçemez.
- Varsayılan aktif sağlayıcı yeni konuşmaya sabitlenir. Devam eden konuşma aynı sağlayıcı/modelle devam eder. Güncel anahtar yalnız sunucuda kısa süreyle çözülür ve mutable buffer'lar temizlenir. Bağlantı kaldırılırsa açık hata gösterilir; gizli fallback yapılmaz.
- OpenAI Responses (`store:false`), Gemini generateContent, Claude Messages ve DeepSeek Chat Completions için ayrı resmî adaptörler. Sabit host, redirect reddi, sınırlı yanıt/istek, güvenli hata kodu. DeepSeek için thinking açıkça disabled. Gemini model parts/thoughtSignature, OpenAI output items ve Claude tool blocks sunucudaki tek tur içinde korunur.
- PostgreSQL'de kullanıcı ve mağaza kapsamlı konuşma, mesaj ve generation operation kayıtları. RLS/FORCE RLS, yalnız kontrollü SECURITY DEFINER erişimi; ham credential/provider cevapları bu tablolara girmez. SQL numarası en az 164; 163 yeniden uygulanmaz.
- Model sadece sınırlı, şeması doğrulanmış okuma araçlarını önerebilir. Gerçek katalog, stok, sipariş, müşteri, promosyon ve satış özeti mevcut repository'lerden okunur; kişisel iletişim/adres ve altyapı bilgileri modele verilmez. Panel kullanım bilgisi sunucuda bakımı yapılan kısa yardım kayıtlarından gelir.
- Sipariş/ödeme/ürün değiştirme talebi doğru ekrana yönlendirilir; bu çalışmada otonom yazma aracı yoktur. Asistan yapılmamış işlemi yapılmış gibi söylememelidir.

## HTTP ve public sözleşme

- `GET /api/toshi/conversations`: son 20 konuşma özeti ve `defaultProvider` (null veya `{provider,model}`). Bu uç izinleri sunucuda çözer; provider ayar mutasyonu yetkisi istemez.
- `GET /api/toshi/conversations/:id`: yetkili konuşma ve son 40 public mesaj.
- `POST /api/toshi/messages`: `{conversationId: UUID|null, expectedVersion: integer|null, text: string}`; UUID `idempotency-key`. İlk mesaj konuşmayı açar; devam mesajı sürüme bağlanır. Cevap `{conversation}`.
- Public konuşma: `{id,title,provider,model,version,createdAt,updatedAt,messages}`. Liste özeti messages içermez. Mesaj: `{id,role:'user'|'assistant',text,sources,createdAt}`. Source `{label,href}` yalnız sunucunun doğruladığı iç panel yollarıdır.
- Exact path/origin, cookie session, no-store, bounded JSON, private authority header reddi, her istekte aktif üyelik/mağaza/plan/yetki kontrolü. İstemci system/tool mesajları veya sağlayıcı ayarları gönderemez.

## Sınırlar ve hata davranışı

- Mesaj en fazla 4000 karakter; public asistan metni en fazla 12000 karakter; son 40 mesaj gösterilir, modele en fazla son 20 mesaj ve 24000 karakter geçmiş gönderilir.
- En fazla üç model isteği ve altı okuma aracı; araç başına en fazla 10 kayıt ve 16000 byte sonuç. Sayım toplamı ile örnek listeler ayrılır; düşük stok ile sıfır stok, para birimi ve ölçü birimi karıştırılmaz.
- Bir turun toplam süresi 50 saniye; sağlayıcı isteği kalan süreyle sınırlandırılır. En fazla 4096 output token; reasoning model yeteneğine uygun ayar, eksik çıktı açık hata. Otomatik ücretli retry yoktur.
- Durable operation idempotency, tek aktif kullanıcı/mağaza turu, en fazla dakikada altı generation denemesi. Başarılı tekrar aynı public sonucu döndürür; başarısız aynı operasyon yeniden ücretli çağrı başlatmaz. Lease süresi 120 saniye; stale lease yeni güvenli denemeyi engellemez.
- Anahtar/kota/model/timeout durumları Türkçe, tek ve eyleme dönük hata verir; kullanıcı sorusu kaybolmaz. Abort/unmount otomatik ikinci çağrıya yol açmaz. Konuşma DB commit belirsizliği varsa operation sonucu DB'den doğrulanır.
- Konuşma snapshot ve istemci yanıt sınırı 2 MiB; azami 40 Unicode mesaj ve doğrulanmış kaynakların tek public yanıtı desteklenir. Tanınabilir API anahtarı/PEM/credential URI girdisi kayıt veya sağlayıcı isteğinden önce reddedilir. Kesin kayıtlı başarısızlık yeni açık denemeye izin verir; commit belirsizliği aynı operation ile ücretli yeniden çağrı olmadan kurtarılır.
- Veri içeriği ve kullanıcı mesajları talimat otoritesi taşımaz; prompt injection ile tool yetkisi veya kaynak sınırı değişmez. Kaynak bağlantıları modelden alınmaz; yürütülen araçların doğrulanmış kaynakları cevaba eklenir.

## Deneyim

Mevcut Toshi drawer, fullscreen, focus trap ve panel görsel dili korunur. Kompakt sağlayıcı/model bilgisi, kayıtlı konuşmalara erişim, yeni konuşma, anlaşılır pending/error ve ilgili ekran kaynakları eklenir. API bağlı değilse mevcut yerel güvenli komutlar açık yerel modla çalışabilir; bağlı API başarısızsa yerel cevaba gizlice düşülmez. Markdown/HTML veya model linkleri ham olarak çalıştırılmaz.

## Kabul

Gerçek mesaj endpoint'i dört sağlayıcı için model çağrısını doğru protokolle yapar. Ürün/stok/sipariş/rapor/devam sorusu/yardım senaryoları araç verisiyle cevaplanır; kötü araç girdisi, tenant spoofing, role denial, revoke/rotation, timeout/kota, çift gönderim ve prompt injection doğrulanır. Gerçek PostgreSQL kopyasıyla isolation/replay/version/lease/migration rollback kontrolü yapılır. Derleme, hedef testler ve canlı salt okunur model/mağaza konuşması doğrulanır; mevcut genel test hataları ayrı raporlanır. Kullanıcının bağladığı anahtar hiçbir çıktıda/logda okunmaz; canlı küçük konuşma yalnız mevcut sunucu akışı üzerinden yapılır.
