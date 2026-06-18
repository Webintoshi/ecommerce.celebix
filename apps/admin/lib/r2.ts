import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

type StoreStorageConfig = {
    r2?: {
        bucketName?: string | null;
        publicUrl?: string | null;
        endpoint?: string | null;
        region?: string | null;
        prefix?: string | null;
        uploadPrefix?: string | null;
        productImagesPrefix?: string | null;
        pageImagesPrefix?: string | null;
        brandingPrefix?: string | null;
        publicUrlTemplate?: string | null;
    };
    media?: {
        publicBaseUrl?: string | null;
        prefix?: string | null;
        uploadPrefix?: string | null;
        productImagesPrefix?: string | null;
        pageImagesPrefix?: string | null;
        brandingPrefix?: string | null;
        publicUrlTemplate?: string | null;
    };
};

let cachedStoreStorageConfig: StoreStorageConfig | null | undefined;

function cleanValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isPlaceholderValue(value: string): boolean {
    return !value || /^your-|^configure-/i.test(value);
}

function firstConfiguredValue(...values: unknown[]): string {
    for (const value of values) {
        const normalized = cleanValue(value);
        if (normalized && !isPlaceholderValue(normalized)) {
            return normalized;
        }
    }

    return "";
}

function readStoreStorageConfig(): StoreStorageConfig | null {
    if (cachedStoreStorageConfig !== undefined) {
        return cachedStoreStorageConfig;
    }

    const slug = firstConfiguredValue(process.env.NEXT_PUBLIC_STORE_SLUG, process.env.STORE_SLUG);
    if (!slug) {
        cachedStoreStorageConfig = null;
        return cachedStoreStorageConfig;
    }

    const candidates = [
        path.join(process.cwd(), "stores", slug, "store.config.json"),
        path.join(process.cwd(), "..", "..", "stores", slug, "store.config.json"),
    ];

    for (const candidate of candidates) {
        if (!existsSync(candidate)) {
            continue;
        }

        try {
            cachedStoreStorageConfig = JSON.parse(readFileSync(candidate, "utf8")) as StoreStorageConfig;
            return cachedStoreStorageConfig;
        } catch (error) {
            console.warn("Store R2 config could not be read:", error);
        }
    }

    cachedStoreStorageConfig = null;
    return cachedStoreStorageConfig;
}

const storeStorageConfig = readStoreStorageConfig();
const STORAGE_ACCOUNT_ID = firstConfiguredValue(
    process.env.CLOUDFLARE_ACCOUNT_ID,
    process.env.R2_ACCOUNT_ID,
    storeStorageConfig?.r2?.endpoint?.match(/^https:\/\/([^.]+)\.r2\.cloudflarestorage\.com/i)?.[1],
);
const R2_ENDPOINT = firstConfiguredValue(
    process.env.R2_ENDPOINT,
    process.env.CLOUDFLARE_R2_ENDPOINT,
    storeStorageConfig?.r2?.endpoint,
) || (STORAGE_ACCOUNT_ID ? `https://${STORAGE_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
const R2_REGION = firstConfiguredValue(process.env.R2_REGION, process.env.CLOUDFLARE_R2_REGION, storeStorageConfig?.r2?.region) || "auto";

// Cloudflare R2 client configuration
const r2Client = new S3Client({
    region: R2_REGION,
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
});

const BUCKET_NAME = firstConfiguredValue(process.env.R2_BUCKET_NAME, storeStorageConfig?.r2?.bucketName) || "celebix-assets";
const PUBLIC_URL = firstConfiguredValue(
    process.env.R2_PUBLIC_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    process.env.R2_PUBLIC_BASE_URL,
    storeStorageConfig?.media?.publicBaseUrl,
    storeStorageConfig?.r2?.publicUrl,
);
const PUBLIC_URL_TEMPLATE = firstConfiguredValue(
    process.env.R2_PUBLIC_URL_TEMPLATE,
    storeStorageConfig?.media?.publicUrlTemplate,
    storeStorageConfig?.r2?.publicUrlTemplate,
);
const R2_PREFIX = firstConfiguredValue(process.env.R2_PREFIX, storeStorageConfig?.media?.prefix, storeStorageConfig?.r2?.prefix);
const R2_UPLOAD_PREFIX = firstConfiguredValue(process.env.R2_UPLOAD_PREFIX, storeStorageConfig?.media?.uploadPrefix, storeStorageConfig?.r2?.uploadPrefix);
const R2_PRODUCT_IMAGES_PREFIX = firstConfiguredValue(
    process.env.R2_PRODUCT_IMAGES_PREFIX,
    storeStorageConfig?.media?.productImagesPrefix,
    storeStorageConfig?.r2?.productImagesPrefix,
);
const R2_PAGE_IMAGES_PREFIX = firstConfiguredValue(
    process.env.R2_PAGE_IMAGES_PREFIX,
    storeStorageConfig?.media?.pageImagesPrefix,
    storeStorageConfig?.r2?.pageImagesPrefix,
);
const R2_BRANDING_PREFIX = firstConfiguredValue(
    process.env.R2_BRANDING_PREFIX,
    storeStorageConfig?.media?.brandingPrefix,
    storeStorageConfig?.r2?.brandingPrefix,
);

// R2 public URL fallback (if custom domain not set)
const R2_FALLBACK_URL = STORAGE_ACCOUNT_ID
    ? `https://${STORAGE_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}`
    : ""; 

// Use custom domain if set, otherwise use R2 default URL
const getPublicUrl = () => PUBLIC_URL || R2_FALLBACK_URL;

function normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function normalizePrefix(value: string): string {
    const normalized = value.replace(/^\/+/, "").replace(/\/+$/, "");
    return normalized ? `${normalized}/` : "";
}

function resolveFolderPrefix(folder: string): string {
    const normalizedFolder = normalizePrefix(folder || "products");
    if (normalizedFolder.startsWith("stores/")) {
        return normalizedFolder;
    }

    if (folder === "products" && R2_PRODUCT_IMAGES_PREFIX) {
        return normalizePrefix(R2_PRODUCT_IMAGES_PREFIX);
    }

    if (folder === "pages" && R2_PAGE_IMAGES_PREFIX) {
        return normalizePrefix(R2_PAGE_IMAGES_PREFIX);
    }

    if ((folder === "branding" || folder === "banners" || folder === "promo-banners") && R2_BRANDING_PREFIX) {
        return `${normalizePrefix(R2_BRANDING_PREFIX)}${normalizedFolder}`;
    }

    const uploadPrefix = normalizePrefix(R2_UPLOAD_PREFIX || `${normalizePrefix(R2_PREFIX)}uploads/`);
    return `${uploadPrefix}${normalizedFolder}`;
}

function buildPublicUrl(key: string): string {
    if (PUBLIC_URL_TEMPLATE && PUBLIC_URL_TEMPLATE.includes("{key}")) {
        return PUBLIC_URL_TEMPLATE.replace("{key}", key);
    }

    const baseUrl = getPublicUrl();
    return baseUrl ? `${baseUrl}/${key}` : "";
}

export interface UploadResult {
    success: boolean;
    url?: string;
    key?: string;
    error?: string;
}

interface UploadToR2Options {
    keyOverride?: string;
}

/**
 * Upload a file to R2 bucket
 */
export async function uploadToR2(
    file: Buffer,
    fileName: string,
    contentType: string,
    folder: string = "products",
    options: UploadToR2Options = {}
): Promise<UploadResult> {
    try {
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key =
            options.keyOverride ||
            `${resolveFolderPrefix(folder)}${Date.now()}-${sanitizedName}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file,
            ContentType: contentType,
        });

        await r2Client.send(command);

        const url = buildPublicUrl(key);
        if (!url) {
            return {
                success: false,
                error: "R2_PUBLIC_URL veya CLOUDFLARE_ACCOUNT_ID/R2_ACCOUNT_ID ayari eksik"
            };
        }

        return {
            success: true,
            url,
            key,
        };
    } catch (error) {
        console.error("R2 upload error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Upload failed",
        };
    }
}

/**
 * Delete a file from R2 bucket
 */
export async function deleteFromR2(key: string): Promise<boolean> {
    try {
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        await r2Client.send(command);
        return true;
    } catch (error) {
        console.error("R2 delete error:", error);
        return false;
    }
}

/**
 * List files in a folder
 */
export async function listR2Files(folder: string = "products"): Promise<string[]> {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `${folder}/`,
        });

        const response = await r2Client.send(command);

        const baseUrl = getPublicUrl();
        return (response.Contents || []).map(item => `${baseUrl}/${item.Key}`);
    } catch (error) {
        console.error("R2 list error:", error);
        return [];
    }
}

/**
 * Get public URL for a key
 */
export function getR2PublicUrl(key: string): string {
    return buildPublicUrl(key);
}

export function getR2PublicBaseUrls(): string[] {
    const templateBaseUrl = PUBLIC_URL_TEMPLATE.includes("{key}")
        ? PUBLIC_URL_TEMPLATE.split("{key}")[0]?.replace(/\/+$/, "")
        : "";

    return Array.from(
        new Set(
            [PUBLIC_URL, templateBaseUrl, R2_FALLBACK_URL]
                .filter((value): value is string => Boolean(value))
                .map((value) => normalizeBaseUrl(value))
        )
    );
}

export function isCurrentStoreR2Url(value: string): boolean {
    try {
        const candidate = normalizeBaseUrl(value);
        return getR2PublicBaseUrls().some((baseUrl) => candidate === baseUrl || candidate.startsWith(`${baseUrl}/`));
    } catch {
        return false;
    }
}

export function isR2Configured(): boolean {
    return Boolean(
        STORAGE_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        BUCKET_NAME &&
        getPublicUrl()
    );
}

export { r2Client, BUCKET_NAME, PUBLIC_URL };
