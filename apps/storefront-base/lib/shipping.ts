import { getStoredShippingZones, saveShippingZones, ShippingZone, ShippingRate } from "./shipping-storage";

const DEFAULT_ZONES: ShippingZone[] = [
    {
        id: "zn-TR",
        name: "Türkiye",
        countries: ["Türkiye"],
        rates: [
            { id: "rt-1", name: "Standart Kargo", price: 49.90, condition: "0kg - 10kg" },
            { id: "rt-2", name: "Ücretsiz Kargo", price: 0, condition: "500₺ üzeri siparişler" },
        ],
    },
];

let cachedZones: ShippingZone[] = [];

if (typeof window !== "undefined") {
    const stored = getStoredShippingZones();
    if (stored.length === 0) {
        saveShippingZones(DEFAULT_ZONES);
        cachedZones = DEFAULT_ZONES;
    } else {
        cachedZones = stored;
    }
}

export function getShippingZones(): ShippingZone[] {
    if (typeof window !== "undefined") {
        cachedZones = getStoredShippingZones();
        if (cachedZones.length === 0) {
            saveShippingZones(DEFAULT_ZONES);
            cachedZones = DEFAULT_ZONES;
        }
    }
    return cachedZones;
}

export function getShippingRatesForCountry(country: string = "Türkiye"): ShippingRate[] {
    const zones = getShippingZones();
    const zone = zones.find(z => z.countries.includes(country)) || zones[0];
    return zone ? zone.rates : [];
}

export function updateShippingZone(id: string, updates: Partial<ShippingZone>): void {
    const zones = getShippingZones();
    const index = zones.findIndex(z => z.id === id);
    if (index !== -1) {
        zones[index] = { ...zones[index], ...updates };
        saveShippingZones(zones);
    }
}

export function deleteShippingZone(id: string): void {
    const zones = getShippingZones();
    const filtered = zones.filter(z => z.id !== id);
    saveShippingZones(filtered);
}
