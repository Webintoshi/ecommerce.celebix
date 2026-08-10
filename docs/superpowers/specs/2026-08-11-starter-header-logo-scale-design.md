# Starter Header Logo Scale Design

## Status

Kullanıcı tarafından yazılı olarak onaylandı.

## Amaç

Starter temadaki mağaza logosunu masaüstü ve mobil header düzenlerinde ölçülü biçimde büyütmek; logo oranını, mevcut header düzenlerini ve erişilebilirliği korumak.

## Tasarım

- Masaüstü logo yüksekliği `46px` yerine `56px`, maksimum genişliği `200px` yerine `240px` olur.
- Mobil logo yüksekliği `38px` yerine `42px` olur.
- Görsel `width: auto` ve `object-fit: contain` ile doğal en-boy oranını korur.
- `menu_logo_actions`, `logo_menu_actions` ve `stacked` düzenlerinin grid davranışı değişmez.
- Herhangi bir sözleşme, veri modeli, migration veya mağazaya özel istisna eklenmez; değişiklik tüm starter tema müşterilerine uygulanır.

## Doğrulama

- Header CSS davranış testi önce eski ölçülerde kırmızıya düşer, yeni ölçülerle yeşile döner.
- Storefront-shared testleri, typecheck ve build çalıştırılır.
- Güzide staging storefront masaüstü ve mobil görünümünde logo oranı ve header taşması kontrol edilir.

