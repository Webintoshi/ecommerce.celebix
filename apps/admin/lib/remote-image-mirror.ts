import { isCurrentStoreR2Url, isR2Configured, uploadToR2 } from "@/lib/r2";

const REMOTE_IMAGE_TIMEOUT_MS = 25_000;
const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;

function isRemoteHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function sanitizeFileSegment(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "") || "image";
}

function extensionFromContentType(contentType: string | null): string {
    const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
    switch (normalized) {
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/png":
            return "png";
        case "image/webp":
            return "webp";
        case "image/avif":
            return "avif";
        case "image/gif":
            return "gif";
        case "image/svg+xml":
            return "svg";
        default:
            return "";
    }
}

function extensionFromUrl(value: string): string {
    try {
        const pathname = new URL(value).pathname;
        const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
        return match?.[1]?.toLowerCase() || "";
    } catch {
        return "";
    }
}

function buildImportFileName(sourceUrl: string, fileBase: string, contentType: string | null): string {
    const requestedName = (() => {
        try {
            const pathname = new URL(sourceUrl).pathname;
            return pathname.split("/").filter(Boolean).pop() || "";
        } catch {
            return "";
        }
    })();

    const baseNameFromUrl = requestedName.replace(/\.[^/.]+$/, "");
    const baseName = sanitizeFileSegment(baseNameFromUrl || fileBase);
    const extension = extensionFromContentType(contentType) || extensionFromUrl(sourceUrl) || "jpg";

    return `${baseName}.${extension}`;
}

async function fetchRemoteImage(sourceUrl: string): Promise<{ buffer: Buffer; contentType: string | null; }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

    try {
        const response = await fetch(sourceUrl, {
            headers: {
                accept: "image/*,*/*;q=0.8",
                "user-agent": "CelebixMediaImporter/1.0",
            },
            redirect: "follow",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`uzak sunucu ${response.status} dondu`);
        }

        const contentType = response.headers.get("content-type");
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
            throw new Error(`gorsel boyutu limitin uzerinde (${Math.round(contentLength / 1024 / 1024)} MB)`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length === 0) {
            throw new Error("gorsel bos dondu");
        }

        if (buffer.length > MAX_REMOTE_IMAGE_BYTES) {
            throw new Error(`gorsel boyutu limitin uzerinde (${Math.round(buffer.length / 1024 / 1024)} MB)`);
        }

        const looksLikeImage =
            (contentType || "").toLowerCase().startsWith("image/") ||
            Boolean(extensionFromUrl(sourceUrl));

        if (!looksLikeImage) {
            throw new Error("URL gecerli bir gorsel donmedi");
        }

        return { buffer, contentType };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("gorsel indirme zaman asimina ugradi");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export function toStorageFolderSlug(value: string | undefined): string {
    const normalized = (value || "image")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || "image";
}

export async function mirrorRemoteImageToR2(
    sourceUrl: string,
    options: {
        folder: string;
        fileBase: string;
        cache?: Map<string, string>;
    }
): Promise<string> {
    const normalizedUrl = sourceUrl.trim();
    if (!normalizedUrl || !isRemoteHttpUrl(normalizedUrl) || isCurrentStoreR2Url(normalizedUrl)) {
        return normalizedUrl;
    }

    const cached = options.cache?.get(normalizedUrl);
    if (cached) {
        return cached;
    }

    if (!isR2Configured()) {
        throw new Error("Bu magazada R2 ayarlari eksik oldugu icin import gorselleri storage'a tasinamadi.");
    }

    const { buffer, contentType } = await fetchRemoteImage(normalizedUrl);
    const uploadResult = await uploadToR2(
        buffer,
        buildImportFileName(normalizedUrl, options.fileBase, contentType),
        contentType || "application/octet-stream",
        options.folder
    );

    if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "R2 upload basarisiz oldu");
    }

    options.cache?.set(normalizedUrl, uploadResult.url);
    return uploadResult.url;
}
