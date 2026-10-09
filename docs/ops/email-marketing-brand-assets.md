# E-posta bağlantıları — marka varlıkları

Kaynak kontrol tarihi: 9 Ekim 2026. Logolar yalnız hangi hizmete bağlantı kurulabildiğini belirtir; ortaklık veya sağlayıcı onayı ifade etmez.

| Dosya | Resmî kaynak | SHA-256 | Boyut |
|---|---|---|---|
| `apps/customer-panel/public/brands/brevo.svg` | [Brevo basın sayfasındaki koyu logo](https://corp-backend.brevo.com/wp-content/uploads/2023/04/Brevo-Logo-1.svg), [basın sayfası](https://www.brevo.com/press/) | `c4cb54430034449ef93447bada3bd1c05c5935a9af1c1d239700c37c55436252` | 2.114 bayt |
| `apps/customer-panel/public/brands/klaviyo.svg` | [Klaviyo newsroom](https://www.klaviyo.com/newsroom) üstbilgisindeki `viewBox="0 0 581 172"` SVG | `fb94284b2c9d804f3ca3f69c22cfd9a1614ce2b0f1c2e9b1200fd41ec5aa8e50` | 4.153 bayt |

Brevo dosyası birebir alındı. Klaviyo dosyasında aynı yollar, renk ve oran korunarak yalnız bağımsız SVG için XML namespace eklendi. Hiçbir bildirim kaldırılmadı. Script, event handler, dış URL, font, style, image ve foreignObject bulunmadığı test edildi. Yerel dosyalar 24 piksel yüksekliğinde, oranı korunarak gösterilir; harici logo isteği yapılmaz.

## Kullanım kapsamı ve yayın kapıları

- [Brevo Developer Terms](https://developers.brevo.com/docs/apps-developer-terms) §9.4, koşullara ve marka kurallarına uyulduğunda doğru birlikte çalışabilirlik anlatımı için sınırlı marka lisansı verir. §6.5 onay/sertifikasyon bulunmadığının bağlantı öncesinde açıkça belirtilmesini gerektirir; bu açıklama bağlantı penceresinde bulunur. §7.1 son kullanıcıya sunmadan önce uygulama kaydı ister. §8(i) ile mağaza anahtarının şifreli saklandığı modelin uyumluluğu yazılı olarak netleştirilmeden canlı anahtar toplama açılmayacak. Brevo'nun resmî Zapier ve Cohort rehberleri üçüncü taraf anahtar kullanımını anlatır; bu, yeni Celebix uygulaması için kendiliğinden istisna sayılmamıştır.
- [Klaviyo API Terms](https://www.klaviyo.com/legal/api-terms), [newsroom](https://www.klaviyo.com/newsroom) ve [güncel kimlik doğrulama rehberi](https://developers.klaviyo.com/en/docs/authenticate_) esas alınır. Newsroom'da sınırsız yeniden kullanım izni varsayılmadı. Yan yana iki sağlayıcı seçiminin rekabet/aggregation hükmüne uyumu ve bu logo kullanımının kapsamı yayın öncesinde netleştirilecek. Kampanya içeriği veya raporları birleştirilmez; her mağazada tek etkin servis vardır.

Bu varlıkların yerel geliştirme ve incelemede bulunması, dağıtım kayıtlarının veya sağlayıcı onaylarının tamamlandığı anlamına gelmez. Kullanıcı adına sağlayıcıya mesaj gönderilmedi; kayıt/uyumluluk talepleri ayrı, gözden geçirilebilir bir başvuru olarak hazırlanır.
