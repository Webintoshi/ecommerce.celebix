# Dahili barkod: 98/99 ile başlayan EAN-13 geçişi

Ürün ekleme, ürün düzenleme ve toplu etiket atama aynı `customer-panel` barkod servisini kullanır. Yeni servis 98 veya 99 ön ekini 10 rastgele hane ve EAN-13 kontrol hanesiyle birleştirir. Bunlar GS1 tarafından tahsis edilmiş ürün GTIN'leri değildir; dahili kullanım içindir. Önceden kaydedilmiş barkodlar ürünlerde kalır; yeni atamalar eski 9 haneli üreticiyi kullanmaz.

## Yayına alma sırası

1. Veritabanı yedeğini ve geri yükleme olanağını doğrulayın. `202609250151` ve `202609250152` geçişlerinin uygulanmış olduğunu, her mağazada mevcut 98/99 ile başlayan 13 haneli ürün barkodlarının tekrarsız olduğunu kontrol edin. Önce staging üzerinde aynı yedekle geçişi deneyin.
2. `202609250155_internal_ean13_barcode.up.sql` ve ardından `202609250155_internal_ean13_barcode_assertions.sql` dosyasını SaaS veritabanında owner yetkisiyle çalıştırın. Bu adım yeni işlevleri ekler; çalışan eski paneli etkilemez. Büyük tablolarda iki indeksin oluşturulması yazma işlemlerini kısa süre bekletebilir; yükü düşük bir zaman seçin.
3. Değişikliği içeren **aynı commit** üzerinden paylaşılan `customer-panel` uygulamasını tüm üretim admin örneklerine yayınlayın. Sabit source commit, image tag ve kalıcı `SOURCE_COMMIT` aynı tam SHA olmalı. Mevcut ödeme build onayları varsa önce ödeme kaynaklarının önceki sürümle aynı olduğunu doğrulayın; resmi generator ile yeni kaynak için mevcut digest değerlerini yenileyin; modları, build/runtime bayraklarını ve kimlik bilgilerini koruyun. Onay değişkeni olmayan sağlayıcıya yeni authority eklemeyin. Eski örnekler trafikten çıktıktan sonra sağlık durumunu ve ürün ekleme/düzenleme düğmesini doğrulayın. Yeni istemci farklı EAN-13 URL'lerini ve sürüm işaretini kullanır: yeni sekme eski sunucuya, eski sekme yeni sunucuya denk gelirse barkod işlemi veri yazılmadan reddedilir. İşlemi yeniden denemeden önce sayfayı yenileyin.
4. Bütün eski panel örnekleri durduktan sonra `202609250156_retire_numeric_internal_barcode.up.sql` ve `202609250156_retire_numeric_internal_barcode_assertions.sql` dosyalarını çalıştırın. Bu adım üç adet 9 haneli barkod üretim işlevini kaldırır; eski ürün barkodlarını silmez.

## Kontrol

- Yeni ürün formunda ve ürün düzenleme ekranında boş barkod alanındaki düğme 13 haneli 98/99 kod üretmeli; kodun kontrol hanesi geçerli olmalı ve ürün kaydedilebilmelidir.
- Toplu etiketteki barkodsuz varyantlara atanan kodlar da aynı biçimde olmalıdır. Var olan barkodlar değişmemelidir.
- Kopya barkod kaydı `barcode_conflict` sonucu vermeli; üretim uç noktaları yeni işlevleri çağırmalıdır.

Geri dönüşte önce `202609250156_retire_numeric_internal_barcode.down.sql` ile eski işlevleri geri getirin, sonra önceki panel sürümünü yayınlayın. Önceki sürümün sabit SHA'sını, `SOURCE_COMMIT` değerini ve mevcut build onayı digest değerlerini yayın kaydından birlikte geri yükleyin; mod/bayrak/kimlik bilgilerini değiştirmeyin. Yeni kodları içeren kayıtlar varken `202609250155_internal_ean13_barcode.down.sql` dosyasını çalıştırmayın; dosyanın koruması buna izin vermez.
