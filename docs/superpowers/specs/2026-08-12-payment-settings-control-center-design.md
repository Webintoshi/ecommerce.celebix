# Payment Settings Control Center Design

## Status

Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Customer-panel ödeme ayarlarını, mevcut gerçek PayTR ve iyzico hosted-checkout altyapısının güvenli bir yönetim yüzeyine dönüştürmek. Panel yalnız gerçekten desteklenen davranışları etkinleştirir; planlanan sağlayıcıları veya desteklenmeyen kart özelliklerini çalışıyormuş gibi göstermez.

## Donor incelemesi

Güzide Kuyumcu WordPress POS ekranında şu yüzeyler doğrulandı:

- test modu ve ödeme yöntemi ekleme;
- sanal POS, iFrame, ortak form, alternatif ödeme, havale ve alışveriş kredisi grupları;
- 3D güvenlik seçimi, kart sahibinin adını isteme, iFrame sunumu ve dil seçimi;
- taksit tablosu görünümü;
- bildirim, webhook ve dışa aktarım entegrasyonları.

Celebix karşılığı donor ekranının birebir kopyası değildir. Hosted ödeme sağlayıcısının sahip olduğu kart formu alanları Celebix tarafından taklit edilmez; kart veya kimlik doğrulama sırları Celebix ayarlarına yazılmaz. Her kontrol mevcut adapter paketinin yetenek matrisiyle sınırlandırılır.

## Mevcut otoriteler

- Mağaza, üyelik ve yetki: server-side `TenantContext`.
- Sağlayıcı bağlantısı ve şifreli sırlar: `merchant_provider_profiles` ve provider-execution runtime.
- Yöntem durumu, sırası ve mağaza-bazlı ayarlar: `payment_methods`.
- Ödeme başlangıç ve callback kanıtı: durable payment-attempt repository.
- Gerçek adapterlar: `paytr_iframe` ve `iyzico_iframe`.
- Yerleşik yöntemler: banka havalesi ve kapıda ödeme.

## Seçilen mimari

Yeni ve paralel bir ödeme ayar tablosu açılmayacak. Sağlayıcıya ait mağaza tercihleri, zaten RLS ile mağazaya bağlanan ve sürümlenen `payment_methods.config` içinde saklanacak. Her provider config'i ortak ve gevşek JSON olarak kabul edilmeyecek; provider koduna göre strict parser ile doğrulanacak.

### Provider ödeme yöntemi ayarı

```ts
type ProviderPaymentMethodPreferences = Readonly<{
  environment: "test" | "live";
  locale: "tr" | "en";
  threeDSecure: "provider_managed";
  installmentMode: "all" | "single_payment" | "limited";
  maxInstallment: 0 | 2 | 3 | 6 | 9 | 12;
}>;
```

Kurallar:

- `environment`, profile execution authority ile birebir eşleşir.
- `threeDSecure` ilk sürümde yalnız `provider_managed` olabilir. Hosted formda Celebix kart güvenliğini düşüremez; “3D'siz” veya “kullanıcıya sor” sahte seçenek olarak gösterilmez.
- PayTR için `single_payment` -> `no_installment=1`, `all` -> `no_installment=0,max_installment=0`, `limited` -> `no_installment=0,max_installment=N`.
- iyzico için `single_payment` -> `enabledInstallments=[1]`, `all` -> alanın gönderilmemesi, `limited` -> `[1,2,...N]` içinden iyzico'nun desteklediği sabit set.
- `locale` iyzico initialize payload'ına taşınır. PayTR hosted formunda dil Celebix tarafından yönetilemediği için UI'da “sağlayıcı yönetir” olarak gösterilir ve config yine güvenli ortak tercih olarak saklanır.

## Runtime akışı

1. Panel provider yöntemini oluştururken güvenli varsayılan config üretir.
2. Ayar çekmecesi, provider packet yeteneklerini ve method config'ini kullanarak yalnız desteklenen kontrolleri açar.
3. POST `/api/payment-methods`, provider config'ini strict parser ile doğrular; bilinmeyen alan, yanlış ortam veya yetenek uyumsuzluğu reddedilir.
4. Payment attempt begin SQL çıktısı aktif yöntem config'ini immutable `methodConfig` snapshot'ı olarak döndürür.
5. Repository ve runtime bu snapshot'ı strict contract ile doğrular.
6. Hosted runtime adapter initialize input'una normalleştirilmiş `preferences` ekler.
7. PayTR/iyzico adapterı yalnız kendi desteklediği alanları resmi provider payload'ına çevirir.
8. Callback, reconciliation, identity, total ve currency kontrolleri değişmez.

## Panel bilgi mimarisi

Tek `/settings/payment` kontrol merkezi:

1. **Genel durum** — aktif yöntem, test/canlı etiketi ve güvenli checkout durumu.
2. **Ödeme yöntemleri** — PayTR, iyzico, havale ve kapıda ödeme; durum/sıra/acil kapatma.
3. **Checkout kuralları** — seçili provider için dil, 3D açıklaması ve taksit politikası.
4. **İşlem görünürlüğü** — bu teslimatta mevcut durable attempt altyapısının güvenli özet modeli; ham kart, token, callback gövdesi veya credential gösterilmez.
5. **Yakında** — webhook/bildirim ve yeni sağlayıcılar ayrı teslimat olarak açıkça etiketlenir, etkinleştirilemez.

## Güvenlik sınırları

- Browser store/tenant/provider authority olamaz.
- Kart numarası, CVV, authorization code, provider token, raw credential veya callback body ayara/loga yazılmaz.
- Config maksimum 8 KiB ve plain immutable JSON olmalıdır.
- Bilinmeyen provider, alan, enum ve taksit değeri fail-closed reddedilir.
- Yalnız aktif profile, exact environment ve compiled adapter evidence eşleşmesi yöntemi çalıştırabilir.
- Production credential, production deployment ve production ödeme denemesi bu görevde yoktur.

## Hata davranışı

- Desteklenmeyen tercih 400 `invalid_input` verir.
- Adapter yeteneği/config/environment uyumsuzluğu 503 `unavailable` verir ve mevcut aktif yöntemi değiştirmez.
- Version conflict güncel method'u yeniden yükler; kör retry yapılmaz.
- Commit sonucu bilinmeyen ödeme akışları mevcut durable reconciliation davranışını korur.
- Panel kaynaklarından biri yüklenemezse mevcut yöntemler son doğrulanmış snapshot ile salt-okunur gösterilebilir, mutation kapatılır.

## Bu teslimatın kapsamı

- strict provider method preference contract;
- payment-method HTTP validation ve güvenli varsayılanlar;
- ödeme-attempt authority içine immutable method-config snapshot;
- PayTR/iyzico adapter initialize tercihleri;
- modern provider ayar çekmecesi ve capability açıklamaları;
- test/live etiketleri, taksit ve dil kontrolleri;
- focused contract, HTTP, runtime, adapter ve UI testleri;
- customer-panel/storefront regression, typecheck ve build.

## Kapsam dışı

- yeni ödeme sağlayıcısı adapterı;
- kart verisi toplayan Celebix formu;
- refund/cancel/capture UI;
- webhook teslimat altyapısı, e-posta/SMS bildirimleri ve Google Sheet;
- üretim credential veya production deploy;
- mevcut callback ve reconciliation güvenlik kurallarının gevşetilmesi.

## Kabul kriterleri

- PayTR ve iyzico ayarları kalıcı, mağaza-bazlı ve strict doğrulanır.
- PayTR taksit tercihi exact provider request alanlarına gider.
- iyzico dil ve taksit tercihi exact JSON payload'a gider.
- Default ayarlar mevcut checkout davranışını değiştirmez.
- Yanlış/hostile config provider veya repository çağrısından önce reddedilir.
- UI desteklenmeyen 3D seçeneklerini etkin kontrol olarak sunmaz.
- Havale/kapıda ödeme ve mevcut provider aktivasyon davranışı gerilemez.
- Raw secret/token/card verisi test çıktısında veya diff'te bulunmaz.

