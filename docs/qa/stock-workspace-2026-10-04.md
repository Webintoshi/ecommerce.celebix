# Tek Stok ekranı — yerel kabul / 4 Ekim 2026

## Kaynak ve kapsam

Üretim temeli efa6c30621b0f4cd30ac6a8a026f81cdc58a66cc. Değişiklik yalnız ortak
Customer Panel stok sunumu, mevcut istemci işlem kontrolü ve eski adres yönlendirmeleri.
API, veri sözleşmesi, native SQL, stok aritmetiği, ödeme, Owner ve storefront kaynakları değişmedi.

## Doğrulanan kontroller

- `npm run test:inventory --workspace @celebix/customer-panel`: 99/99.
- Odaklı sidebar/navigation/parity: 26/26. Önceki tam navigation/parity: 45/45.
- Next production build: exit0; compile96s, TypeScript62s,95staticpage.
- Bağımsız inceleme: sayım başlangıç snapshot/reset, yeni kayıt sonrası lifecycle,
  izin ayrımı, kısmi satın alma iptali, işlem kilidi ve depo bakiyesi/eksik kayıt ayrımı.
- Gerçek Chrome, yalıtılmış bellek fixture'sı: sayım oluştur→başlat→8 yerine6
  say→kaydet→fark -2 incele→uygula; ilgili deponun8→6 olması ve diğer depoda3 kalması.
- Satın alma: 2 adet,14,89 TL→taslak kalem birim maliyeti14,89; kayıttan sonra
  Siparişi ver ve teslim alma alanı aynı pencerede erişilebilir.
- Stok ekle: tıklanan ürün/varyant ve seçili depo satın alma formuna taşınıyor.
- 1440×1000,1024×900,390×844: viewport dışında yatay taşma yok.
- Telefon işlem penceresi viewport içinde; Tab/Shift+Tab odak pencerede,
  Escape güvenli temiz formu kapatıyor; arka plan inert.
- Hata: ürün/depo sorgu hatası tekrar deneme alanında; uydurma sıfır stok yok.
- Görüntüleme yetkisi: değişiklik/oluşturma düğmeleri yok; gerçek bakiyeler okunuyor.
- Dokuz eski liste/yeni/detay adresi aynı Stock sayfasının tam ilgili işlemine gider.

## Sınırlar ve mevcut baseline bulguları

Browser fixture bellekte yapay ürün/depo kullanır; üretim mal kabulü/sayımı veya
finans kaydı oluşturmaz. Native stok aritmetiği ve stok rezerv korumaları değiştirilmedi.
Kısmi/tam teslim ve taşıma lifecycle'ları mevcut controller/istemci testlerinde doğrulandı.
Yerel dev fixture başlangıçtaki HMR CSS yükleme sorunu sabit CSS witness importuyla
çözüldü; üretim sayfasının normal statik importu production build'de doğrulandı.
Chrome eklentisinin body'ye eklediği __processed attribute development hydration
uyarısı üretim app kaynağına ait değil; derlemenin başarısı yerine sayılmadı.

Geniş eski panel-shell koşusunda100/103 geçti; üç mevcut Dashboard source/CSS
beklentisi stok değişikliğinden bağımsız kaldı. Dashboard dosyalarının diff'i sıfır.
İlgili ayrı Mira Dashboard görevi için adları iletildi; bu kapsamda değişmediler.
Bu bulgu stok/navigation başarılarıyla gizlenmedi.

Yerel disk yetersizliği nedeniyle ilk build kesildi. Yalnız eski inactive Seo ve bu
çalışmanın yeniden üretilebilir Next cache'i temizlendi. Son stabil build başarılı.

## Yayın

Ortak branch'e güncel a1929760 belge kabulü alınır; ardından bu aday eklenir.
NET→SITE sıralı normal yayın ve gerçek çalışan imaj/kaynak/payment/native okuyucu
kontrolleri bitmeden canlı kabul tamamlandı sayılmaz. Canlı sonuç ayrı kayıtla eklenir.

## İlk canlı yayın ve büyük katalog düzeltmesi

İlk aday `1fc45e89213a04c295a417a9f52d7b1e5bbb9cbe` iki panelde normal sırayla tamamlandı:
NET `d11aowdjkcb1j90rfh91d55f`, SITE `bbtsj4of2f4mvg2x873ggv5y`.
Gerçek imaj/kaynak/cohort, dört PayTR okuyucusu, native214 ve ham yapılandırma
korumaları geçti; global yayın kuyruğu boş. Storefrontlar `7d864534` kaldı.

Chrome'da Butik Siora gerçek stokları, tek menü girişi, satın alma penceresi ve üç eski
liste adresinin doğru sekmeye yönlenmesi doğrulandı. Üretimde stok/sayım/mal kabulü
kaydı oluşturulmadı. 264 depo satırının 250'si aktif katalog varyantı; diğer14 satır
arşivlenmiş varyant bakiyesi. Aktif kayıp varyant yok; bu kayıtlar değiştirme işlemi
açmadan korunuyor.

Güzide'de canlı kabul, eski genel liste sınırını ortaya çıkardı: 1.213 geçerli depo
bakiye satırı repository'deki500 sınırını aşıp503 oluşturuyordu. Bunların1.194'ü aktif
katalog varyantı,19'u arşivlenmiş varyant; DTO/geçersiz bakiye yok. Bu nedenle ilk
yayın canlı kabul tamamlandı olarak raporlanmadı.

Düzeltme yalnız depo bakiyesi **okumasında**, repository→HTTP→istemci üç katmanında
5.000 sınırı kullanır. Diğer liste ve yazma kalemleri500, yanıt1MiB, tekil DTO,
sıralı/benzersiz varyant, mağaza/depo yetkisi, stok aritmetiği, işlem anahtarı ve
beklenen sürüm korunur. SQL/veri şeması değişmez. 501/5.000 satır regresyonları önce
beklenen hata ile başarısız oldu; düzeltme sonrası repository21/21, HTTP21/21,
istemci11/11, stok regresyon102/102 geçti. 5.001 ve sınır dışı kayıtlar reddedilir.

Yerel bağımlılıklar yeniden indirilmedi. Donor bağımlılık dosyaları tekrar kullanılırken
18 `@celebix` workspace bağlantısı bu çalışma ağacındaki gerçek paketlere bağlandı;
testlerdeki ikinci hata sınıfı örneği ve yerel build'in eski repository okuması önlendi.
Paket/lock/build ayarı değişmedi. Son birleşmiş adayın derlemesi ve sıralı canlı kabulü
ayrıca doğrulanacak.

## Son birleşik yayın ve canlı kabul

Yayımlanan kaynak: `4c477071f86bf0053bb95fd7ca25c04b5204f50e`.
Önceki canlı `1fc45e89` üzerine yalnız üç bakiye okuyucusu ve bağımsız incelenen
Mira Dashboard/Analytics/Extras yedi arayüz dosyası alındı. QA/test değişiklikleri
ayrı exact kapsamla kontrol edildi. Mevcut native214, storefront7d ve ödeme
kaynakları/ayarları korunur; veri şeması veya finans hareketi değişmedi.

- Yeni gerçek production build: exit0, compile51s, TypeScript48s,95 statik sayfa.
- Yeni derlenmiş kabul:14 ayrı rota,8 istemci özellik grubu, bakiye5000 sınırı.
- Hedefli stok102/102; repository21/21, HTTP21/21, istemci11/11; eski üç stok menü
  bağlantısını bekleyen navigation testi güncellenip ayrıca1/1 geçti.
- Kit:11 kapsam ve17 native koruma testi, PHP lint,361 saf güvenlik kontrolü geçti.
- Tam panel koşusu2108 test:2054 geçti,53 başarısız,1 atlandı. Sonradan düzeltilen
  bir eski stok menü beklentisi bu53 içindeydi. Kalan52 başarısız testin günlük ve
  kaynak incelemesinde yeni stok/Mira regresyonu işareti bulunmadı:3 önceden
  kaydedilmiş Dashboard,2 değişmeyen analytics beklentisi,47 diğer değişmeyen kapsam.
  Bu52 testin eski sürümde yeniden çalıştırıldığı veya tüm paketin geçtiği iddia edilmez.

Taze resmi PayTR generator/check kanıtı aday ve gerçek1fc/7d baseline'ları için
üç onay profiliyle üretildi. Dört uygulamanın gerçek ödeme profilleri değişmedi.
Özel ham snapshot ve geri dönüş provası geçti. Normal yayın sırası:

1. NET: `sin13ehzluhyklg1xqwt3mhj` — finished.
2. SITE: `my2j4w4lhuf0sajrjm96pcf6` — finished; NET actual runtime/cohort geçtikten sonra.

Son `run.py verify` exit0: iki panel gerçek imaj/kaynak/14rota/8grup doğrulandı;
dört PayTR okuyucusu,52 finans fonksiyonu,20 ödeme koruması ve7 aktif preflight
korundu. İki storefront7d kaldı; global yayın kuyruğu boş.

Chrome canlı kabulünde:

- Siora264 satır; tek Stok menüsü, beş ortak sekme; hata ve yatay taşma yok.
- Güzide1213 satırın tamamı; hata ve yatay taşma yok. Son aktif katalog ürünü
  Romanson Rms.1.ag1584.02 aramasında1/1213 bulundu; filtre temizlenince1213 döndü.
- Güzide yeni satın alma penceresi gerçek ürün/varyant isimleri ve depo seçenekleriyle
  açıldı; kaydetmeden kapatıldı. Üretimde sayım, satın alma, stok veya finans kaydı yazılmadı.
- Arşivlenmiş varyantların bakiyeleri korunur; değiştirme işlemi açılmaz.
- Canlı Chrome5 viewport override390 istediği hâlde gerçek DOM/screenshot1471 kaldı;
  bu nedenle canlı390 kanıtı iddia edilmedi, yanlış isimli geçici ekran kaydı kaldırıldı.
  Yerel1440/1024/390, mobil işlem penceresi ve klavye kabulü yukarıdaki geçerli kanıttır.
  Override resetlendi; gerçek Güzide Stok ekranı inceleme için açık bırakıldı.

Gerçek ekranlar: `evidence/stock-workspace/live-net-final.png` ve
`evidence/stock-workspace/live-guzide-desktop.png`. Bu sonuç kaydı yalnız belge/kanıt
commit'idir; yeni uygulama yayını veya SOURCE_COMMIT değişikliği gerektirmez.
