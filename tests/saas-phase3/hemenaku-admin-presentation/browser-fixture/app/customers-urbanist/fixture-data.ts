import { parseCustomerDetail, parseCustomerListItem, parseCustomerSummary, parseCustomerTag, parseCustomerSegment, parseCustomerWorkspace } from "@celebix/saas-contracts";

export const NOW = "2026-10-26T10:30:00.000Z";
export const CUSTOMER_ID = "81000000-0000-4000-8000-000000000001";
const identity = (group: number, index: number) => `${group}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const TAGS = [
  { id: identity(84, 1), name: "Hediye alışverişi", color: "#667085", customerCount: 3, version: 1 },
  { id: identity(84, 2), name: "Mağazadan teslim", color: "#67988a", customerCount: 2, version: 1 },
  { id: identity(84, 3), name: "Özel koleksiyon önceliği", color: "#2b2b2b", customerCount: 1, version: 1 },
  { id: identity(84, 4), name: "VIP", color: "#fe6100", customerCount: 4, version: 1 },
].map(parseCustomerTag).sort((a, b) => a.name.localeCompare(b.name));
export const SEGMENTS = [
  { id: identity(85, 1), name: "Sadakat müşterileri", kind: "manual", description: "Tekrar alışveriş yapan ve yeni koleksiyonlarla ilgilenen müşteriler.", customerCount: 4, version: 1 },
  { id: identity(85, 2), name: "Özel gün alışverişi", kind: "manual", description: "Hediye, yıl dönümü ve özel gün alışverişleri için oluşturulan grup.", customerCount: 2, version: 1 },
  { id: identity(85, 3), name: "Yeni müşteriler", kind: "manual", customerCount: 3, version: 1 },
].map(parseCustomerSegment);
const names = [
  ["Aylin Zeynep", "Yılmaz Demirci Uzunsoy"], ["Deniz", "Aydın"], ["Ece", "Kaya"], ["Selin", "Demir"],
  ["Derya", "Aksoy"], ["Bora", "Çelik"], ["Mina", "Güneş"], ["İpek", "Arslan"],
];
export const CUSTOMERS = names.map(([firstName, lastName], index) => {
  const tags = index === 0 ? TAGS.map(({ id, name, color }) => ({ id, name, color })) : index % 2 === 0 ? TAGS.slice(0, 1).map(({ id, name, color }) => ({ id, name, color })) : [];
  return parseCustomerDetail({
    id: identity(81, index + 1), status: index === 6 ? "archived" : "active", firstName, lastName, displayName: `${firstName} ${lastName}`,
    ...(index === 4 ? {} : { email: index === 0 ? "aylin.zeynep.yilmaz.demirci.uzunsoy@example.test" : `ornek.musteri${index + 1}@example.test`, phone: `+9055500012${String(index + 10)}` }),
    orderCount: index === 0 ? 12 : index % 3, totalSpentCents: index === 0 ? 24873500 : index % 3 * 145000,
    currency: "TRY", tags, version: 3, createdAt: "2026-01-15T08:00:00.000Z", updatedAt: NOW,
    ...(index % 3 ? { lastOrderAt: "2026-10-23T11:45:00.000Z" } : {}),
    addresses: index === 0 ? [
      { id: identity(82, 1), label: "Ev", recipientName: `${firstName} ${lastName}`, line1: "Örnek Mahallesi, Tasarım Caddesi No: 12", line2: "Uzun Apartman Adı, B Blok, Kat 4, Daire 18", city: "İstanbul", district: "Kadıköy", postalCode: "34710", country: "TR", isDefault: true, version: 1 },
      { id: identity(82, 2), label: "İş yeri", recipientName: `${firstName} ${lastName}`, line1: "Atölye Sokak No: 42", city: "İstanbul", district: "Beşiktaş", country: "TR", isDefault: false, version: 1 },
    ] : [],
    consents: index === 0 ? [{ channel: "email", status: "granted", recordedAt: "2026-02-12T14:00:00.000Z" }, { channel: "phone", status: "denied", recordedAt: "2026-02-12T14:00:00.000Z" }, { channel: "whatsapp", status: "granted", recordedAt: "2026-08-10T09:00:00.000Z" }] : [],
    notes: index === 0 ? [
      { id: identity(83, 1), text: "Hediye paketinde fiyat etiketi bulunmamasını istiyor. Teslimattan önce telefonla bilgi verilecek.", createdAt: "2026-10-25T15:30:00.000Z" },
      { id: identity(83, 2), text: "Yeni koleksiyon için ince zincir ve küçük halka küpe modelleriyle ilgileniyor.", createdAt: "2026-09-18T10:00:00.000Z" },
    ] : [],
    segments: index === 0 ? SEGMENTS.slice(0, 2).map(({ id, name, kind }) => ({ id, name, kind })) : [],
  });
});
export function listItem(customer: typeof CUSTOMERS[number]) {
  const { addresses, consents, notes, segments, ...item } = customer;
  return parseCustomerListItem(item);
}
export const SUMMARY = parseCustomerSummary({ active: 7, archived: 1, consentedEmail: 1, totalSpentCents: CUSTOMERS.reduce((sum, customer) => sum + customer.totalSpentCents, 0), currency: "TRY", asOf: NOW });
export function workspace(customerId: string, empty = false) {
  const position = CUSTOMERS.findIndex(customer => customer.id === customerId);
  return parseCustomerWorkspace({
    neighbors: {
      ...(position > 0 ? { previous: { id: CUSTOMERS[position - 1].id, displayName: CUSTOMERS[position - 1].displayName } } : {}),
      ...(position >= 0 && position + 1 < CUSTOMERS.length ? { next: { id: CUSTOMERS[position + 1].id, displayName: CUSTOMERS[position + 1].displayName } } : {}),
    },
    orders: empty ? [] : [
      { id: identity(87, 1), orderNumber: "WEB-001240", status: "preparing", paymentStatus: "completed", totalCents: 789000, currency: "TRY", createdAt: "2026-10-23T11:45:00.000Z" },
      { id: identity(87, 2), orderNumber: "POS-0000108", status: "delivered", paymentStatus: "completed", totalCents: 1249000, currency: "TRY", createdAt: "2026-10-14T15:10:00.000Z" },
      { id: identity(87, 3), orderNumber: "WEB-001172", status: "pending", paymentStatus: "pending", totalCents: 569000, currency: "TRY", createdAt: "2026-09-26T08:20:00.000Z" },
    ],
  });
}
