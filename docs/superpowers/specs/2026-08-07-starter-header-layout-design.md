# Starter Header Layout Design

Status: Kullanıcı tarafından 2026-08-07 tarihinde görsel referansla onaylandı.

## Amaç

Mağaza yöneticisi, **Tasarım → Tema düzeni → Menü ve duyuru** alanından masaüstü header yerleşimini seçebilmeli; seçim aynı sürümlü tema taslağına kaydolmalı ve yalnız yayınlandıktan sonra storefront'ta görünmelidir.

## Düzenler

- `menu_logo_actions`: Menü solda, logo ortada, mağaza araçları sağda. Varsayılan ve kullanıcının referans görselindeki düzen.
- `logo_menu_actions`: Logo solda, menü yanında/ortada, mağaza araçları sağda.
- `stacked`: Logo üst sırada ortada, mağaza araçları sağda; menü ayrı alt sırada ortada.

Mobilde mevcut erişilebilir drawer korunur; masaüstü seçimi mobil otoriteyi değiştirmez. Mevcut `headerStyle` ve `headerWidth` kontrolleri de görsel sistemden **Menü ve duyuru** paneline taşınır.

## Veri ve güvenlik

`headerLayout`, schema-v2 kompozisyonun `visual` bölümünde zorunlu ve enum-sınırlı bir alan olur. Eski kayıtlar PostgreSQL migration ile `menu_logo_actions` değerine yükseltilir. Serbest CSS, browser store/tenant otoritesi veya gizli alan eklenmez.

## Doğrulama

Sözleşme parser testleri geçerli üç değeri kabul edip bilinmeyen değeri reddeder. Composer testi ayarın doğru sekmede olduğunu, storefront testi seçimin `data-header-layout` üzerinden gerçek CSS düzenine dönüştüğünü ve migration testi mevcut kayıtların varsayılan düzene yükseldiğini kanıtlar.
