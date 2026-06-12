export interface EmailConfig {
    provider: "smtp" | "aws-ses" | "resend";
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    senderName: string;
    senderEmail: string;
    apiKey?: string; // For API-based providers
}

export interface SMSConfig {
    provider: "netgsm" | "iletimerkezi" | "twilio";
    apiKey: string;
    apiSecret?: string;
    senderTitle: string;
}

export interface PushConfig {
    provider: "firebase";
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
}

export interface NotificationSettings {
    email: EmailConfig;
    sms: SMSConfig;
    push: PushConfig;
}
