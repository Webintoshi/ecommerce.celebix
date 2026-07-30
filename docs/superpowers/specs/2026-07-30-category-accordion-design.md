# Kategori accordion tasarımı

Durum: Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Customer-panel `/products/categories` yüzeyinde üst kategorileri her zaman görünür tutmak, alt kategorileri kendi üst kategorilerinin altında erişilebilir bir dropdown/accordion grubu içinde göstermek ve uzun düz listeyi sadeleştirmek.

## Seçilen yaklaşım

`CategoryManager` kontrollü bir `Set<string>` ile açık üst kategori kimliklerini tutar. Başlangıçta tüm gruplar kapalıdır. Alt kategorisi bulunan her aktif üst kategori, en az 48×48 piksel bir toggle ile bağımsız açılıp kapanır; birden fazla grup aynı anda açık kalabilir.

Alternatifler:

- Native `details/summary`: mevcut düzenleme, arşivleme ve alt kategori eylemleriyle tıklama/odak davranışını gereksiz biçimde birbirine bağladığı için seçilmedi.
- Tek-açık klasik accordion: merchant'ın iki kategori grubunu yan yana karşılaştırmasını engellediği için seçilmedi.

## Bileşen davranışı

- Hiyerarşi ve sıralama için mevcut `buildCatalogCategoryHierarchy` tek kaynak olarak kalır.
- Kök kategoriler `parentId` bulunmayan satırlardan oluşturulur.
- Bir kökün bütün torunları mevcut sıraları korunarak yalnız o kök açıkken render edilir.
- Toggle yalnız dropdown durumunu değiştirir; düzenle, arşivle ve alt kategori ekle eylemlerini tetiklemez.
- Alt kategorisi olmayan köklerde yanıltıcı toggle gösterilmez.
- Kategori CRUD payloadları, API çağrıları, TenantContext ve kalıcı veriler değişmez.
- Teknik slug hiçbir merchant yüzeyinde yeniden gösterilmez.
- Üst ve alt kategori düzenleme/arşivleme/alt kategori ekleme kontrolleri korunur.

## Erişilebilirlik ve responsive davranış

- Toggle gerçek bir `button` olur ve `aria-expanded` ile `aria-controls` taşır.
- Alt kategori bölgesi sabit ve güvenli bir DOM kimliğiyle ilişkilendirilir.
- Chevron açık durumda döner; `prefers-reduced-motion` altında animasyon yaklaşık sıfıra iner.
- Klavye ile Enter ve Space doğal button davranışıyla çalışır.
- Mobil düzende eylemler taşmadan alt satıra geçer; toggle ve diğer etkileşimli hedefler en az 48×48 piksel kalır.

## Testler

TDD kapsamı şunları kanıtlar:

1. İlk render'da 14 kök görünür, alt kategori içerikleri kapalıdır.
2. Bir kök açıldığında yalnız kendi alt kategorileri görünür.
3. İkinci kök açıldığında ilk kök açık kalır.
4. Aynı köke tekrar basıldığında yalnız o grup kapanır.
5. Alt kategorisi olmayan kökte toggle bulunmaz.
6. `aria-expanded`, `aria-controls`, 48 piksel hedef ve reduced-motion stilleri korunur.
7. Düzenleme, arşivleme ve alt kategori oluşturma authority akışı değişmez.
8. Teknik kategori slugı render edilmez.

## Kapsam

Uygulama yalnız kategori manager bileşeni, ilgili CSS ve dar customer-panel testlerini değiştirir. PostgreSQL, migration, API, sözleşme, Owner, storefront, R2, production ve mevcut Güzide kategori ilişkileri değişmez.
