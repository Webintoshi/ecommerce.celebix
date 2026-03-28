import type { EmailConfig, NotificationSettings, SMSConfig } from "@/types/notification";
import { STORE_RUNTIME } from "@/lib/store-runtime";

// Mock initial data
const defaultSettings: NotificationSettings = {
    email: {
        provider: "smtp",
        host: "smtp.example.com",
        port: 587,
        secure: false,
        user: "user@example.com",
        password: "",
        senderName: STORE_RUNTIME.name,
        senderEmail: STORE_RUNTIME.senderEmail,
    },
    sms: {
        provider: "netgsm",
        apiKey: "",
        apiSecret: "",
        senderTitle: STORE_RUNTIME.smsSenderTitle,
    },
    push: {
        provider: "firebase",
        apiKey: "",
        authDomain: "",
        projectId: "",
        storageBucket: "",
        messagingSenderId: "",
        appId: "",
    },
};

let currentSettings = { ...defaultSettings };

export const getNotificationSettings = async (): Promise<NotificationSettings> => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return currentSettings;
};

export const updateNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    currentSettings = settings;
    // In a real app, this would persist to DB
};

export const testEmailConnection = async (config: EmailConfig): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // Simulate success if host/apiKey is present
    if (config.provider === "smtp") return !!config.host;
    return !!config.apiKey;
};

export const testSMSConnection = async (config: SMSConfig): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return !!config.apiKey;
};
