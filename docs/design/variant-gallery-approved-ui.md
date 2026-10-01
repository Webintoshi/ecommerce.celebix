# Varyant görselleri — Mira görsel uyarlaması

Onaylı Celebix Operations dilinin mevcut varyant galerisine uygulanması. Temel kaynak e7e8b36c; yalnız Customer Panel sunumu değişir. Backend dosyaları: NONE.

## İşlev envanteri

- Birincil iş: yüklenmiş ürün görsellerinden varyanta özel galeri ve kapak seçmek.
- Bilgi: varyant kimliği, mevcut ürün görselleri, seçili adet/16 sınırı, sıra ve ilk görselin kapak olması.
- Ana işlem: Uygula. İkincil: Vazgeç/kapat/Escape, görsel seç/kaldır, öne/arkaya taşı, Ürün görsellerini kullan.
- Toplu işlem: ortak nitelikten eşleşen varyantları ayrı ayrı işaretleyerek uygula; hiçbir hedef kendiliğinden seçilmez.
- Yeni üründe yerel taslak galerisi; mevcut üründe bağımsız galeri kaydı. Hata seçimi ve aynı işlem anahtarını korur; sürüm çatışmasında güncel sürümü yüklemek mümkündür.
- Küçük resim: fiyat/stok düzenleyicisinden bağımsız açılış; yetki, arşiv ve yükleme engelleri korunur. Yükleme hatasında tekrar dene.
- Diğer kurallar: 16 görsel/ürün, 5 MB/dosya, dosya çoğaltmama; kurtarma ve mağaza/sepet/POS/sipariş ilişkileri korunur.

## Sunum

Odaklı galeri diyaloğu: masaüstünde ürün görselleri ve seçili sıra yan yana; mobilde tek sütun. Başlık yalnız diyalog kimliği. İnce ayraçlar, ortak #f8f7f5 zemin, nötr yazılar, grafit Uygula; turuncu yalnız seçim/fokus işareti. Kapak ve sıra kontrolleri açıklayıcı erişilebilir adlar ve küçük çizgi ikonları taşır. Toplu uygulama ayrı düz bölümde; açık hedef seçimi ve etkilenecek varyant adedi görünür.

Ortak button/feedback sınıfları ve cp-* renkleri kullanılır. Sayfa başlığı, yeni API, SQL, bağımlılık veya galeri kaydetme sözleşmesi eklenmez. Küçük resim yükleme ve boş/hata durumları belirgindir.

## Doğrulama

Mevcut davranış testleri, gerçek bileşenlerin yalıtılmış tarayıcı ekranı; 1440/1024/390, klavye/fokus/Escape, boş/yükleme/hata; iki ortak panel için kaynak ve çalışma zamanı doğrulaması. Yayın mevcut mağaza sürümünü veya veri katmanını değiştirmez.
