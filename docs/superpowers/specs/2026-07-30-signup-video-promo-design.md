# Celebix Kayıt Sayfası Video Promosyon Revizyonu

## Amaç ve kapsam

`/kayit` sayfasının onaylanan altı alanlı sol formunu korurken sağ promosyon alanını daha gerçekçi, ürün odaklı ve hafif bir video deneyimine dönüştürmek. Bu revizyon ayrıca ana butonun altına kullanım sözleşmesi vurgusunu ve iki güven maddesini ekler.

## Onaylanan yön

- Sağdaki mevcut rozet, yörünge, büyük `C` kartı ve soyut dekorasyon kaldırılacak.
- Yerine gerçek ürün fotoğrafları içeren modern bir e-ticaret mağazası videosu kullanılacak.
- Video 6–8 saniye süren, sessiz, otomatik başlayan, kesintisiz dönen ve kullanıcı etkileşimi istemeyen bir ürün demosu olacak.
- Sağ bölümün metni **“Ücretsiz mağazanı bugün aç”** ve **“Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla.”** olacak.
- Sol formun alanları, mağaza adresi türetme davranışı, validasyonu ve kayıt API'si değişmeyecek.

## Video anlatımı

1. Sıcak ve gerçekçi bir stüdyo ortamındaki dizüstü bilgisayar üzerinde Celebix ile kurulmuş mağaza görünür.
2. Mağaza kahraman görselinden ürün listesine yumuşak bir geçiş yapılır.
3. Bir ürün sepete eklenir ve küçük, sade bir **“Sipariş alındı”** bildirimi görünür.
4. Son kare başlangıç kompozisyonuna yumuşakça bağlanarak sıçramasız döngü oluşturur.

Video üzerinde ses, video kontrol çubuğu, dikkat dağıtan kamera hareketi, büyük logo animasyonu veya doğrulanmamış satış rakamı bulunmayacak.

## Görsel sistem

- Sol zemin gerçek beyaz, sağ zemin sıcak ve açık nötr olacak.
- Celebix turuncusu `#FE6100`, antrasit `#242424` ve gri yardımcı metinler korunacak.
- Video sağ alanın ana görseli olacak; ayrıca büyük dış kart, rozet veya kart içinde kart kullanılmayacak.
- Mağaza arayüzü ve ürün fotoğrafları gerçekçi olacak; ürün kartları, fiyatlar ve navigasyon okunabilir fakat formdan daha baskın olmayacak.
- Başlık mevcut sürümden daha küçük ve daha kısa tutulacak; tüm içerik küçük dizüstü ekranında ilk görünüm içine sığacak.

## Form altı sözleşme ve güven alanı

- Ana butonun hemen altında şu metin yer alacak: **“E-Ticaret Sistemi Kur'a tıklayarak Kullanım sözleşmesi’ni onaylıyorum.”**
- **“Kullanım sözleşmesi”** metni Celebix turuncusu ve altı çizili vurgu olarak gösterilecek.
- Depoda işletme tarafından onaylanmış bir kullanım sözleşmesi hedefi bulunmadığı için bu revizyon sahte veya eksik bir hukuki sayfaya bağlantı vermeyecek. Onaylı sözleşme URL'si sağlandığında vurgu gerçek bağlantıya dönüştürülecek; bu değişiklik ayrı hukuki içerik kapsamıdır.
- Alt sırada ince çizgili ikonlarla **“Ömür boyu ücretsiz”** ve **“Kredi kartı gerektirmez”** ifadeleri bulunacak.
- İki güven maddesi masaüstünde yatay, mobilde gerektiğinde iki satıra kırılacak; ayrı kart veya kutu kullanılmayacak.

## Teknik medya davranışı

- Birincil video WebM, uyumluluk yedeği MP4 olacak.
- Video `autoplay`, `muted`, `loop` ve `playsInline` özelliklerini kullanacak; kontrol çubuğu gösterilmeyecek.
- İlk görüntü için aynı kompozisyondan optimize edilmiş poster kullanılacak.
- `prefers-reduced-motion: reduce` durumunda video oynatılmayacak ve poster gösterilecek.
- Mobilde ağ ve işlem yükünü azaltmak için poster öncelikli olacak; video yalnızca yeterli alan ve hareket izni olduğunda gösterilecek.
- Video içerik değil dekoratif ürün gösterimi olduğundan erişilebilirlik ağacından gizlenecek; promosyon mesajı gerçek HTML metni olarak kalacak.
- Hedef bütçe WebM için 1.5 MB, MP4 için 3 MB altında olacak; ilk sayfa yüklenmesini engellemeyecek şekilde medya ön yüklemesi sınırlandırılacak.

## Responsive davranış

- Masaüstünde video ve promosyon metni formun sağında dengeli bir kompozisyonda yer alacak.
- `1100px` altında promosyon formun altına geçecek ve yüksekliği azaltılacak.
- `640px` altında gerçekçi poster kırpılarak korunacak; başlık tek veya iki dengeli satır olacak ve yatay taşma olmayacak.
- Form, ana buton, sözleşme metni ve güven maddeleri video alanından önce kalacak.

## Bileşen sınırları

- Sağ video alanı kayıt sayfasından ayrılan küçük bir promosyon bileşeni olacak.
- Video kaynakları ve poster `apps/owner/public/media/` altında tutulacak.
- Form altı güven satırı kayıt formunda kalacak; kayıt verisine yeni alan eklemeyecek.
- Başarılı kayıt ve kayıt kapalı durumları mevcut davranışlarını koruyacak.

## Hata ve yedekleme davranışı

- Video yüklenmez veya oynatılamazsa poster görünür kalacak; boş ya da kırık medya alanı oluşmayacak.
- Video oynatma hatası formu ve CTA'yı etkilemeyecek.
- Onaylı hukuki hedef bulunmadığı sürece sözleşme vurgusu etkileşimli kontrol gibi davranmayacak.

## Doğrulama

- Video döngüsünün sessiz, kontrolsüz ve sıçramasız olduğu masaüstünde doğrulanacak.
- Poster yedeği, mobil kırpma ve hareket azaltma davranışı kontrol edilecek.
- Görünür form alanlarının yine yalnızca altı adet olduğu ve onay kutularının dönmediği test edilecek.
- Sözleşme/güven metinleri ve ikon hizası tarayıcıda doğrulanacak.
- Owner testleri, typecheck ve production build çalıştırılacak.
- Son masaüstü ve mobil ekran görüntüleri onaylanan görsel konseptle karşılaştırılacak.
