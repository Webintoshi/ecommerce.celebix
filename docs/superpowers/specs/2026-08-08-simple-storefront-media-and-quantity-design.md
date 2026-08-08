# Basit Vitrin Görseli ve Miktar Kontrolü Tasarımı

Durum: Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Tasarım ekranındaki vitrin görseli yükleme akışını teknik bilgi gerektirmeden kullanılabilir hâle getirmek ve tek `Miktar seçimini göster` kararının yayınlanan tekil ürün sayfasında gerçekten uygulanmasını sağlamak.

## Vitrin görseli akışı

Yükleme alanı üç açık adımdan oluşur:

1. `Nerede kullanacaksınız?` — Ana sayfa bannerı, logo, kategori, sosyal paylaşım ve site simgesi büyük, açıklamalı seçim düğmeleriyle sunulur.
2. `Görsel şekli` — Seçilen kullanım alanına uygun 1:1, 3:4, 4:5 ve 16:9 oranları gerçek şekillerle gösterilir. Uygun olmayan oranlar hiç gösterilmez.
3. `Görseli seçin` — Dosya seçildiğinde küçük bir önizleme, piksel ölçüsü ve anlaşılır uygunluk sonucu gösterilir. Yanlış oran R2 yüklemesinden önce reddedilir.

Oran seçimi görseli kesmez veya yeniden kodlamaz. Takı ve logo ayrıntılarını korumak için dosyanın gerçek ölçüsü seçilen orana yüzde iki toleransla uymalıdır. Sunucuya yeni authority alanı gönderilmez; mevcut exact `file`, `kind`, `altText` form sözleşmesi korunur. Seçilen oran yalnız istemci tarafındaki hazırlık doğrulamasıdır.

Kullanım alanı oranları:

- Ana sayfa bannerı: 16:9 veya 3:4.
- Kategori: 1:1, 3:4 veya 4:5.
- Logo: 1:1 veya 16:9.
- Sosyal paylaşım: 1:1 veya 16:9.
- Site simgesi: yalnız 1:1.

`Alternatif metin` etiketi `Görselde ne var?` olarak açıklanır ve örnek metin gösterilir. Dosya kontrolü özel bir seçme alanına dönüştürülür; seçilen dosyanın adı, önizlemesi ve ölçüsü görünür. Mevcut varlık kartları sabit yatay kırpma yerine doğal oranlarında render edilir ve `1:1`, `3:4`, `4:5`, `16:9` ya da `Özel oran` rozeti taşır.

## Miktar seçici authority'si

Kök neden: `composition.cart.showQuantitySelector` taslakta ve yayınlanmış sunumda doğru taşınıyor, yan sepet bunu kullanıyor; ancak `ProductPurchasePanel` bu değeri hiç almıyor ve miktar kontrolünü koşulsuz render ediyor.

Tek authority korunur. Kontrol, kullanıcı beklentisine uygun olarak `Ürün sayfası` ayarlarına yerleştirilir ve `Ürün ve yan sepette miktar değiştirmeyi göster` şeklinde adlandırılır. `Sepet` sekmesindeki ikinci görünüm kaldırılır; aynı karar iki yerde düzenlenemez.

Yayınlanan değer `false` olduğunda:

- tekil ürün sayfasında `− 1 +` render edilmez;
- sepete ekle ve şimdi satın al işlemleri güvenli varsayılan miktar `1` ile çalışır;
- satın alma düğmeleri boşalan alanı doldurur;
- tema önizlemesinde miktar kontrolü veya `1 adet` yerine boşluk bırakılmaz;
- yan sepette mevcut salt-okunur `1 adet` bilgisi korunur, değiştirme düğmeleri gösterilmez.

Legacy ve quick-view çağrıları varsayılan olarak miktar seçiciyi göstermeye devam eder. Bu teslimat yalnız yayınlanan tekil ürün sayfası authority bağlantısını onarır.

## Güvenlik ve kapsam

- PostgreSQL migration, R2 anahtarı, asset sözleşmesi veya API body değişikliği yoktur.
- Store/storefront authority tarayıcıdan kabul edilmez.
- Görsel byte'ları mevcut doğrulama ve R2 saga hattından geçmeye devam eder.
- Production deploy bu teslimatın parçası değildir.

## Kabul kriterleri

- Beş kullanım alanı ve uygun oranlar görsel düğmelerle seçilebilir.
- Yanlış oran yükleme isteği oluşturmadan reddedilir.
- 896×1195 gibi gerçek 3:4 görseller doğru sınıflandırılır.
- Mevcut dik varlıklar yatay kutuya kırpılmaz.
- Gizli miktar ayarı tekil ürün sayfasındaki seçiciyi kaldırır ve miktar 1 ile satın alma çalışır.
- Açık miktar ayarı mevcut stok-sınırlı artırma/azaltma davranışını korur.
- Customer-panel ve storefront testleri, typecheck ve build geçer.
