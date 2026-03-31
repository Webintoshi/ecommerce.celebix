import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const STORAGE_ACCOUNT_ID =
    process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "";

// Cloudflare R2 client configuration
const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${STORAGE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "celebix-assets";
const PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

// R2 public URL fallback (if custom domain not set)
const R2_FALLBACK_URL = STORAGE_ACCOUNT_ID
    ? `https://${STORAGE_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}`
    : ""; 

// Use custom domain if set, otherwise use R2 default URL
const getPublicUrl = () => PUBLIC_URL || R2_FALLBACK_URL;

function normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

export interface UploadResult {
    success: boolean;
    url?: string;
    key?: string;
    error?: string;
}

/**
 * Upload a file to R2 bucket
 */
export async function uploadToR2(
    file: Buffer,
    fileName: string,
    contentType: string,
    folder: string = "products"
): Promise<UploadResult> {
    try {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${folder}/${timestamp}-${sanitizedName}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file,
            ContentType: contentType,
        });

        await r2Client.send(command);

        const baseUrl = getPublicUrl();
        if (!baseUrl) {
            return {
                success: false,
                error: "R2_PUBLIC_URL veya CLOUDFLARE_ACCOUNT_ID/R2_ACCOUNT_ID ayari eksik"
            };
        }
        const url = `${baseUrl}/${key}`;

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
    return `${getPublicUrl()}/${key}`;
}

export function getR2PublicBaseUrls(): string[] {
    return Array.from(
        new Set(
            [PUBLIC_URL, R2_FALLBACK_URL]
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
