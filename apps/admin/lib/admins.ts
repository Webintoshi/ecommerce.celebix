"use client";

import { STORE_RUNTIME } from "@/lib/store-runtime";

// Admin type
export interface Admin {
    email: string;
    addedAt: number;
}

// Default Admin Configuration
const DEFAULT_ADMIN: Admin = {
    email: STORE_RUNTIME.defaultAdminEmail,
    addedAt: Date.now(),
};

const STORAGE_KEY = `celebix_admins_${STORE_RUNTIME.slug}`;

// Initialize admins if not present
export function initializeAdmins() {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([DEFAULT_ADMIN]));
    }
}

// Get all admins
export function getAdmins(): Admin[] {
    if (typeof window === "undefined") return [DEFAULT_ADMIN];

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        // If not stored, initialize and return default
        initializeAdmins();
        return [DEFAULT_ADMIN];
    }

    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error("Error parsing admins:", e);
        return [DEFAULT_ADMIN];
    }
}

// Add a new admin
export function addAdmin(email: string): { success: boolean; message: string } {
    const admins = getAdmins();

    if (admins.some((a) => a.email === email)) {
        return { success: false, message: "Bu e-posta adresi zaten kayıtlı." };
    }

    const newAdmin: Admin = {
        email,
        addedAt: Date.now(),
    };

    const updatedAdmins = [...admins, newAdmin];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAdmins));
    return { success: true, message: "Yönetici başarıyla eklendi." };
}

// Delete an admin
export function deleteAdmin(email: string): { success: boolean; message: string } {
    const admins = getAdmins();

    if (email === STORE_RUNTIME.defaultAdminEmail) {
        return { success: false, message: "Varsayılan yönetici silinemez." };
    }

    if (admins.length <= 1) {
        return { success: false, message: "En az bir yönetici bulunmalıdır." };
    }

    const updatedAdmins = admins.filter((a) => a.email !== email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAdmins));
    return { success: true, message: "Yönetici başarıyla silindi." };
}

// Verify admin login (This is a simplified check, in a real app this would be server-side)
// We are trusting that if the email exists in our list, and the password matches our *global* password logic
// (Since we don't have a secure backend DB for passwords here, we'll keep the simple logic requested or slightly improved)
// For this task, user asked to "add admin". We will assume same password for all for simplicity OR 
// we simply check if email exists in the allowed list + standard password. 
// Let's assume the request implies managing ACCESS, so we check if email is in the allowed list.
// The password "admin123" seems to be shared or we can store simple passwords. 
// Let's store simple passwords for now to make it somewhat realistic? 
// The prompt didn't strictly specify password management, but "add admin" implies creating credentials.
// I'll update the logic to store passwords (insecurely in localStorage as per constraint) for this demo.

export interface AdminWithPass extends Admin {
    password?: string; // Optional for migration, but new ones will have it
}

export function authenticateAdmin(username: string, passwordInput: string): boolean {
    // Allow webintosh admin
    if (username === "webintosh" && passwordInput === "**06122021Kam.**") {
        return true;
    }

    // Legacy fallback for old admin
    if (username === STORE_RUNTIME.defaultAdminEmail && passwordInput === "admin123") {
        return true;
    }

    const admins = getAdmins();
    const admin = admins.find((a) => a.email === username);

    if (!admin) return false;

    const storedAdminsWithPass = getAdminsWithPass();
    const found = storedAdminsWithPass.find(a => a.email === username);

    if (found && found.password === passwordInput) {
        return true;
    }

    return false;
}

function getAdminsWithPass(): AdminWithPass[] {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

export function addAdminWithPassword(email: string, password: string): { success: boolean; message: string } {
    const admins = getAdminsWithPass();

    if (admins.some((a) => a.email === email)) {
        return { success: false, message: "Bu e-posta adresi zaten kayıtlı." };
    }

    const newAdmin: AdminWithPass = {
        email,
        password,
        addedAt: Date.now(),
    };

    const updatedAdmins = [...admins, newAdmin];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAdmins));
    return { success: true, message: "Yönetici başarıyla eklendi." };
}

// Initialize with default admin having password
if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        const defaultWithPass: AdminWithPass = {
            email: STORE_RUNTIME.defaultAdminEmail,
            password: "admin123",
            addedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultWithPass]));
    }
}
