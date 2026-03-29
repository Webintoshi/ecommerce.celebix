export interface ShippingRate {
    id: string;
    name: string;
    price: number;
    condition?: string;
}

export interface ShippingZone {
    id: string;
    name: string;
    countries: string[];
    rates: ShippingRate[];
}

const STORAGE_KEY = "celebix_storefront_shipping_zones";

export function getStoredShippingZones(): ShippingZone[] {
    if (typeof window === "undefined") return [];

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error("Error loading shipping zones from storage:", error);
    }

    return [];
}

export function saveShippingZones(zones: ShippingZone[]): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
    } catch (error) {
        console.error("Error saving shipping zones to storage:", error);
    }
}

export function addStoredShippingZone(zone: ShippingZone): void {
    const zones = getStoredShippingZones();
    const existingIndex = zones.findIndex(z => z.id === zone.id);

    if (existingIndex >= 0) {
        zones[existingIndex] = zone;
    } else {
        zones.push(zone);
    }

    saveShippingZones(zones);
}

export function deleteStoredShippingZone(id: string): void {
    const zones = getStoredShippingZones();
    const filtered = zones.filter(z => z.id !== id);
    saveShippingZones(filtered);
}
