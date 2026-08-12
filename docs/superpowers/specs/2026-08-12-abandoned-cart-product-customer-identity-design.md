# Abandoned Cart Product and Customer Identity Design

## Status

Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Terk edilen sepet listesinin hangi ürünleri içerdiğini göstermesi ve yalnız doğrulanmış storefront müşteri oturumuna bağlı sepetlerde gerçek müşteri hesabını güvenli biçimde sunması.

## Yetki ve veri sınırları

- Ürün adı, varyant, SKU ve görsel kalıcı `saas.abandoned_cart_items` snapshot'ından gelir; canlı katalog daha sonra değişse bile tarihsel sepet kanıtı değişmez.
- Müşteri hesabı e-posta veya telefon benzerliğiyle tahmin edilmez.
- Storefront `customer` cookie'si yalnız mevcut HMAC keyring ile digest adaylarına çevrilir; ham credential PostgreSQL'e, loga veya panele taşınmaz.
- PostgreSQL, aday digest'i aktif `saas.storefront_customer_credentials` satırı üzerinden doğrular ve sepeti aynı mağazadaki `saas.customers` kaydına foreign key ile bağlar.
- Anonim sepetler müşteri kimliği olmadan çalışmaya devam eder.
- Panel projection yalnız mağaza-scope merchant authority sonrasında `customerId`, ad, e-posta ve telefon bilgisi döndürür.

## Akış

1. Cart mutation runtime, varsa müşteri cookie'sinden en fazla 16 digest adayı üretir; salt-okunur cart GET davranışını değiştirmez.
2. Repository bu adayları cart mutation SQL sınırına ekler.
3. PostgreSQL aynı mağaza, geçerli süre ve digest eşleşmesini atomik biçimde doğrular; bağlı durable abandoned-cart snapshot'ını aynı transaction içinde `customers` foreign key'iyle bağlar.
4. Daha sonraki anonim mutasyonlar mevcut doğrulanmış müşteri bağını kaldırmaz; farklı bir hesap aynı sepete bağlanmaya çalışırsa işlem fail-closed kalır.
5. Liste projection ilk ürün adını, toplam kalem sayısını ve doğrulanmış müşteri alanlarını döndürür.
6. Masaüstü ve mobil panel ilk ürün adını, ek ürün sayısını ve mevcut müşteri iletişim bilgilerini gösterir.

## Hata davranışı

- Eksik müşteri cookie'si anonim akışı bozmaz.
- Hatalı müşteri cookie'si müşteri otoritesi sağlamaz ve sepeti başka müşteriye bağlamaz.
- Yanlış mağaza, süresi dolmuş credential veya forged digest müşteri ilişkisi yaratmaz.
- Ürün kalemi olmayan bozuk projection contract tarafından reddedilir.

## Kabul kriterleri

- Liste her sepet için ilk ürün adını gösterir; birden fazla kalemde `+N ürün` özeti vardır.
- Müşteri hesabına bağlı sepetlerde müşteri adı, e-posta ve telefon görünür; müşteri detayına güvenli bağlantı sağlanır.
- Anonim sepet açıkça anonim görünür.
- Arama ürün adına ek olarak mevcut müşteri alanlarında çalışır.
- Ham credential, digest veya mağazalar arası müşteri bilgisi projection'a çıkmaz.
- Contract, repository, SQL assertion/harness, HTTP ve masaüstü/mobil UI testleri geçer.
