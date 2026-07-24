const DTOS = Object.freeze({
  "catalog-summary": dto("Kalıcı mağaza özeti", [["Toplam ürün", "12", "Yetkili katalog kaydı"], ["Aktif ürün", "9", "Yayınlanabilir kayıt"], ["Düşük stok", "2", "Kalıcı stok görünümü"]], [["Katalog", "Hazır", "12 ürün ve 18 varyant"], ["Siparişler", "Hazır", "Son kalıcı sipariş 24 Temmuz"]]),
  "catalog-products": dto("Katalog kayıtları", [["Taslak", "3", "Sürümlü ürün"], ["Aktif", "9", "Yayınlanabilir ürün"], ["Varyant", "18", "Kalıcı varyant"]], [["Keten Gömlek", "Taslak", "TRY · sürüm 3"], ["Seramik Kupa", "Aktif", "TRY · sürüm 7"]]),
  "analytics-dashboard": dto("Aylık ticari özet", [["Gelir", "₺12.500", "Kalıcı ödenmiş siparişler"], ["Sipariş", "24", "2 iptal · 1 iade"], ["Yeni müşteri", "8", "Kalıcı müşteri kaydı"]], [["01–07 Temmuz", "₺4.200", "8 ödenmiş sipariş"], ["08–14 Temmuz", "₺8.300", "16 ödenmiş sipariş"]]),
  "order-detail": dto("Sipariş ORDER_ID", [["Toplam", "₺1.250", "TRY"], ["Ürün", "2", "Kalıcı satır"], ["Ödeme", "Ödendi", "Yetkili durum"]], [["Keten Gömlek", "2 adet", "Birim fiyat ₺625"], ["Teslimat", "Hazırlanıyor", "İstanbul / Türkiye"]]),
  "customer-detail": dto("Müşteri CUSTOMER_ID", [["Sipariş", "4", "Kalıcı sipariş"], ["Toplam", "₺3.980", "TRY"], ["Sürüm", "5", "İyimser kilit"]], [["Deniz Kaya", "Etkin", "deniz@example.test"], ["E-posta izni", "Verildi", "Kalıcı kanal izni"]]),
  "catalog-extra": dto("Katalog ekstra RESOURCE_ID", [["Sürüm", "4", "Kalıcı kaynak"], ["Ürün", "3", "Atanmış ürün"], ["Durum", "Aktif", "Yayınlanabilir kayıt"]], [["Hediye paketi", "Aktif", "Ürün ayrıntısında seçilebilir"], ["Kart notu", "Taslak", "Yalnız önizleme"]]),
  "purchase-orders": dto("Satın alma siparişleri", [["Açık", "2", "Kalıcı sipariş"], ["Beklenen", "48", "Stok birimi"], ["Tedarikçi", "2", "Yetkili kayıt"]], [["PO-2026-014", "Onaylandı", "24 stok birimi bekleniyor"], ["PO-2026-015", "Taslak", "24 stok birimi planlandı"]]),
  "inventory-counts": dto("Stok sayımları", [["Açık sayım", "1", "Kalıcı çalışma"], ["Satır", "12", "Sayılan varyant"], ["Fark", "−2", "Doğrulanmayı bekliyor"]], [["Temmuz depo sayımı", "Sayımda", "12 varyant"], ["Haziran depo sayımı", "Kapalı", "Farklar uygulandı"]]),
  "inventory-transfers": dto("Stok transferleri", [["Yolda", "1", "Kalıcı transfer"], ["Birim", "16", "Taşınan stok"], ["Konum", "3", "Yetkili depo"]], [["TR-2026-008", "Yolda", "Merkez → Kadıköy"], ["TR-2026-007", "Teslim alındı", "Merkez → Beşiktaş"]]),
  "price-lists": dto("Fiyat listeleri", [["Aktif", "2", "Sürümlü liste"], ["Kural", "6", "Kalıcı fiyat kuralı"], ["Ürün", "9", "Kapsanan ürün"]], [["Perakende TRY", "Aktif", "9 ürün · sürüm 6"], ["Bayi TRY", "Taslak", "6 ürün · sürüm 2"]]),
  "seo-product-entry": dto("Ürün SEO kayıtları", [["Hazır", "8", "Yerel yapılandırma"], ["Taslak", "1", "Eksik açıklama"], ["Kapsam", "9", "Aktif ürün"]], [["Keten Gömlek", "Hazır", "Başlık ve açıklama kayıtlı"], ["Seramik Kupa", "Taslak", "Açıklama bekleniyor"]]),
  "import-preview": dto("Yerel içe aktarma önizlemesi", [["Satır", "2", "Yerel CSV"], ["Geçerli", "2", "Şema doğrulandı"], ["Hata", "0", "Kalıcı aktarım yapılmadı"]], [["Shopify CSV", "Hazırlandı", "2 satır · sürüm 1"], ["Kataloğa aktar", "Bekliyor", "Ayrı kullanıcı onayı gerekli"]]),
  "settings": dto("Mağaza ayarları", [["Dil", "Türkçe", "Kalıcı tercih"], ["Para birimi", "TRY", "Kalıcı tercih"], ["Bildirim", "3", "Etkin kanal"]], [["Genel ayarlar", "Hazır", "Sürümlü yapılandırma"], ["Kargo ayarları", "Hazır", "2 teslimat seçeneği"]]),
  "negative-route": dto("Geçersiz rota", [["Etkin menü", "Yok", "Yakın eşleşme reddedildi"], ["Yetki", "Kapalı", "Güvenli varsayılan"], ["İstek", "Yerel", "Dış trafik yok"]], [["/products-evil", "Reddedildi", "Ürünler menüsü etkin değil"]]),
});

const operations = new Set<string>();

function dto(badge: string, metrics: readonly (readonly [string, string, string])[], records: readonly (readonly [string, string, string])[]) {
  return Object.freeze({
    badge,
    metrics: Object.freeze(metrics.map(([label, value, detail]) => Object.freeze({ label, value, detail }))),
    records: Object.freeze(records.map(([name, state, detail]) => Object.freeze({ name, state, detail }))),
  });
}

async function selected(context: { params: Promise<{ slug: string[] }> }) {
  return (await context.params).slug.join("/");
}

export async function GET(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  const key = await selected(context);
  const state = new URL(request.url).searchParams.get("state");
  if (state === "error") return Response.json({ code: "fixture_unavailable" }, { status: 503 });
  if (state === "conflict") return Response.json({ code: "version_conflict", version: 2 }, { status: 409 });
  const value = DTOS[key as keyof typeof DTOS];
  if (!value) return Response.json({ code: "invalid_input" }, { status: 400 });
  if (state === "empty") return Response.json({ ...value, records: [] });
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  const key = await selected(context);
  if (!(key in DTOS)) return Response.json({ code: "invalid_input" }, { status: 400 });
  const body = await request.json() as { operationId?: unknown };
  if (typeof body.operationId !== "string" || body.operationId.length < 3) return Response.json({ code: "invalid_input" }, { status: 400 });
  const replayed = operations.has(body.operationId);
  operations.add(body.operationId);
  return Response.json({ key, replayed, state: "accepted_for_local_fixture" });
}
