# Kargo ilerlemesi, yorum toplama ve stok bildirimi

## Kullanıcının istediği sonuç

Ücretsiz kargo ilerlemesi Tasarım / Yan sepet içinde açılır ve mağaza sahibi eşik tutarını belirler. Yorum toplama Ürünler / Yorumlar sayfasının doğal özelliğidir. Stok gelince haber ver, Mağaza Araçları içinde ayrı açılıp kapatılır. Mevcut iletişim balonu, tasarım Uygula/Vazgeç, yorum moderasyonu ve mağazaların farklı temaları korunur.

Kullanıcı bu üç özelliğin uygulanmasını açıkça istedi. Önceki oturumdaki uygulama ve ortak yayın yetkisi devam eder; yeni bir onay aşaması eklenmez.

## Üç bağımsız özellik

1. **Kargo:** başlangıçta kapalı olan yan sepet seçeneği kullanılabilir hale gelir. TL girişi güvenli kuruş hesabına dönüşür. Eşik yalnız görsel değildir: sepet ve bütün ödeme hazırlama yolları aynı gerçek teslimat politikasını kullanır. Hesabın dayanağı, kuponlardan önce ürünlerin toplamıdır; kargo ücreti ve diğer ücretler ilerlemeye eklenmez. Aktif teslimat profili bulunmadığında çubuk ücretsiz kargo vaat etmez. Eski belgelere ve kullanılmayan eski eşik kayıtlarına yeni bir ücret davranışı uygulanmaz.
2. **Yorumlar:** mevcut liste, filtre, onay, ret, arşiv ve mağaza yanıtı korunur. Yeni istek ayarları ve istek geçmişi aynı sayfada yer alır. Davet edilen gerçek satın alma için yıldız, başlık ve yorum yazılır; yorum önce onay bekler. Doğrulanmış satın alma bilgisi sunucu tarafından belirlenir. Otomatik istek varsayılan kapalıdır; açıldığında teslim edilmiş ve ödenmiş yeni siparişler için varsayılan yedi gün bekler. Geçmiş siparişler kendiliğinden e-posta yağmuruna dönüşmez; uygun geçmiş siparişler bilinçli manuel işlemle seçilir. İstekleri kapatma bağlantısı bulunur.
3. **Stok:** başlangıçta kapalı ayrı araçtır. Müşteri tükenmiş renk/bedeni seçip yalnız bu varyantın tek seferlik e-posta bildirimi için kaydolur; e-posta onayı gerekir. Pazarlama aboneliği oluşturulmaz. Satılabilir stok rezervasyonlarla birlikte doğrulanır. Gönderim anında stok tekrar kontrol edilir. İptal bağlantısı, bekleyen/gönderilen/başarısız durumları ve mağaza ayrımı bulunur. Bildirim stok ayırmaz.

## Ortak kayıt ve bildirim altyapısı

Mevcut yetki, mağaza sahipliği, sürüm ve idempotency sözleşmeleri kullanılır. Müşteri e-postaları, davet bağlantıları ve işlem kimlikleri public katalog veya yönetim dışı listelere sızmaz. Yeni kayıtlar RLS ve dar kapsamlı RPC ile korunur.

İki ortak storefront dağıtımı mevcut platform Resend bağlantısını paylaşan arka plan görevini çalıştırır. Mağaza başına yeni uygulama kurulmaz. Veritabanı kiraları aynı bildirimin iki süreçte gönderilmesini engeller. Gönderim içeriği ve sağlayıcı işlem anahtarı tekrar denemelerde sabit kalır. Sağlayıcının 24 saatlik idempotency süresi aşıldığında belirsiz teslimat otomatik yeniden gönderilmez. Hatalar kullanıcıya anlaşılır durum olarak yansır. Canlı kabul gerçek müşterilere sahte bildirim göndermeden yapılır.

## Kabul ölçütleri

- Kargo: kapalı/açık, eşik altı/eşit/üstü, adet değişimi, boş sepet, profil yokluğu, gerçek ödeme tutarı ve eski tasarım uyumu.
- Yorumlar: uygun olmayan siparişin reddi, tek davet/tek yorum, güvenli token, onay öncesi gizlilik, onay ve yanıtın mağazada görünmesi, iptal ve hata sonrası tekrar.
- Stok: aynı mağaza/varyant/e-posta tekrarları, farklı mağazada aynı e-posta, e-posta onayı/iptal, rezervasyonlu stok, bir defalık gönderim, iki çalışan süreç ve hata sonrası tekrar.
- Her üç arayüz: Uygula/Vazgeç, korunmuş girişler, 1440/1024/390 genişlik, yatay taşma olmaması, klavye/odak, mevcut tasarım dili.
- Önce uyumlu SQL ve storefront, ardından NET/SITE paneller. Ödeme sağlayıcı kanıtları ve mevcut ortak sürüm korunur.

## Araştırma kaynakları

- [Judge.me yorum toplama](https://judge.me/help/en/articles/11960176-collecting-web-reviews)
- [Klaviyo varyant bazlı stok bildirimi](https://developers.klaviyo.com/en/docs/how_to_set_up_custom_back_in_stock)
- [Resend idempotency anahtarları](https://resend.com/docs/dashboard/emails/idempotency-keys)
