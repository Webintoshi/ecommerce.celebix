# Görsel Değer Önerileri Düzenleyicisi Tasarımı

Durum: Uygulandı ve yerel doğrulamaları tamamlandı.

## Amaç

Customer-panel içindeki `value_propositions` bölümünü, müşterinin storefront'ta göreceği simgeyi seçmeden önce görmesini ve başlık/açıklama metnini serbestçe yazabilmesini sağlayan sade bir düzenleyiciye dönüştürmek.

## Kapsam

- Hedef uygulama `apps/customer-panel`.
- Mevcut `StarterThemeSectionConfigV2` sözleşmesi korunur.
- PostgreSQL migration, yeni asset türü veya storefront veri modeli değişikliği yoktur.
- Mevcut altı simge korunur: özen, malzeme, memnuniyet, güven, teslimat ve iade.
- Bölüm iki ile dört değer kartı arasında kalır.

## Etkileşim tasarımı

Her değer önerisi tek bir kompakt düzenleme kartıdır. Kartın üst kısmı, storefront görünümüne yakın canlı bir örnek gösterir:

- seçilen gerçek ikon;
- müşterinin yazdığı başlık;
- müşterinin yazdığı kısa açıklama.

Simge bir metin tabanlı `<select>` ile değil, altı seçenekli görsel bir seçim grubu ile belirlenir. Her seçenek gerçek Lucide ikonunu ve Türkçe adını gösterir. Seçili seçenek renk, kenarlık ve `aria-pressed` düğme semantiğiyle açıkça ayırt edilir. Klavye ve ekran okuyucu kullanımı korunur.

Başlık ve açıklama kontrollü alanlardır. Müşteri hazır metinle sınırlandırılmaz; kendi metnini yazabilir, değiştirebilir ve kaydedebilir. Başlık 1–120, açıklama 1–300 karakter sınırlarını korur.

Yeni kart düğmesi “Yeni değer önerisi” yerine “Değer ekle” olarak sadeleştirilir. Eklenen kart boş, açık ve düzenlemeye hazır gelir; ancak mevcut sözleşmenin boş metni kabul etmemesi nedeniyle taslak önizleme/otomatik kayıt katmanı boş alanı kontrollü biçimde doğrulama hatası olarak gösterir. Kullanıcı doldurmadan yayınlama mümkün olmaz. Hazır pazarlama metni dayatılmaz.

Silme işlemi kart başlığındaki ikon düğmesine taşınır. İki kart kaldığında devre dışıdır. Mevcut ana bölüm sıralama kontrolleri değişmez. Kart içi sıralama bu teslimatta eklenmez; veri modelinde sıralama mevcut dizi sırasıdır ve gerekirse ayrı bir iyileştirme olur.

Uzun güvenlik açıklaması ana akıştan kaldırılır. Yerine kısa bir bilgi satırı gösterilir: “Yalnızca mağazanızın gerçekten sunduğu avantajları yazın.” Sahte puan, sayaç veya müşteri sözü yasağı veri/sunum güvenlik kontrollerinde korunur; kullanıcı arayüzünü kalabalıklaştırmaz.

## Veri akışı

`StarterRetailSectionEditor` değer kartları için ayrı bir geçici, immutable istemci taslağı tutar. Böylece müşteri mevcut metni tamamen silebilir ve alanın eski değere geri sıçraması olmadan yenisini yazabilir. Her değişiklik taslakta görünür; yalnız bütün kartların başlık ve açıklamaları sözleşme sınırları içinde dolu olduğunda mevcut `updateSection` sınırına gönderilir. Kaydetme, parse ve yayınlama mevcut starter-theme composition hattından geçer. Storefront `CampaignValuePropositions` müşterinin kaydettiği metni ve seçtiği ikonu aynen render etmeye devam eder.

## Dosyalar

- `apps/customer-panel/components/settings/StarterRetailSectionEditors.tsx`
  - görsel ikon seçici;
  - düzenlenebilir başlık/açıklama;
  - kompakt kart kontrolleri.
- `apps/customer-panel/components/settings/starter-theme-composer.module.css`
  - ikon ızgarası, seçili durum, kompakt kart ve responsive düzen.
- `apps/customer-panel/components/settings/starter-retail-composer.test.mjs`
  - görsel ikon seçimi ve serbest metin sözleşmesi.
- Gerekirse aynı klasörde dar bir istemci bileşeni testi; uygulama dışı sözleşme değişikliği yapılmaz.

## Test kabul kriterleri

- Altı ikonun tamamı gerçek simgesi ve adıyla görünür.
- Seçilen ikon görsel ve erişilebilir şekilde ayırt edilir.
- Müşteri başlık ve açıklamaya kendi metnini yazabilir.
- Değişen metin immutable section payload'ına ve canlı önizlemeye taşınır.
- Boş veya sınırı aşan metin yayınlanamaz; güvenli doğrulama korunur.
- İki kartın altına inilemez, dört kartın üzerine çıkılamaz.
- Salt okunur veya işlemdeki durumlarda bütün kontroller devre dışıdır.
- Mobilde ikonlar ve kartlar taşma üretmez; hedefler en az 44×44 pikseldir.
- Customer-panel test, typecheck ve build regresyonları geçer.

## Kapsam dışı

- Kullanıcı görseli yüklemek veya özel SVG eklemek.
- Yeni ikon paketi ya da bağımlılık.
- Storefront bölümünün görsel tasarımını değiştirmek.
- Değer önerilerini yapay zekâyla üretmek.
- Production deploy veya veri migration'ı.
