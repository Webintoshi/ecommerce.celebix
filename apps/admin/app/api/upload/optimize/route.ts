import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { resolveAdminAssetUrl } from "@/lib/asset-url";
import { requireLegacyAdminApi } from "@/lib/legacy-admin-api-auth";
import { parseLegacyAssetSource } from "@/lib/legacy-media-policy";
import { fetchLegacyRemoteImage } from "@/lib/legacy-remote-image";
import { fetchCurrentStoreR2Asset } from "@/lib/r2-asset-fetch";

export const dynamic = 'force-dynamic';

async function getSharp() {
    const sharpModule = await import("sharp");
    return sharpModule.default;
}

const MAX_DIMENSIONS = {
    products: { width: 2048, height: 2048 },
    categories: { width: 1200, height: 1200 },
    banners: { width: 1920, height: 1080 },
    "promo-banners": { width: 1920, height: 1350 },
    default: { width: 1920, height: 1920 }
};

function getFolderConfig(folder: string): string {
    if (folder === 'promo-banners') return 'promo-banners';
    if (folder === 'banners') return 'banners';
    if (Object.hasOwn(MAX_DIMENSIONS, folder)) return folder;
    return 'default';
}

async function optimizeImageFromUrl(
    imageUrl: URL,
    folder: string,
    targetFormat: 'avif' | 'webp' = 'avif',
    quality: number = 80
) {
    const sharp = await getSharp();
    const configKey = getFolderConfig(folder);
    const dimensions = MAX_DIMENSIONS[configKey as keyof typeof MAX_DIMENSIONS] || MAX_DIMENSIONS.default;

    const asset = await fetchCurrentStoreR2Asset(imageUrl.href) ?? await fetchLegacyRemoteImage(imageUrl);
    const inputBuffer = asset.body;
    const originalSize = inputBuffer.length;

    const metadata = await sharp(inputBuffer).metadata();

    let processedImage = sharp(inputBuffer)
        .resize(dimensions.width, dimensions.height, {
            fit: "inside",
            withoutEnlargement: true
        })
        .rotate()
        .grayscale(false)
        .withMetadata({
            orientation: undefined
        });

    if (targetFormat === 'avif') {
        processedImage = processedImage.avif({
            quality: quality,
            effort: 6
        });
    } else {
        processedImage = processedImage.webp({
            quality: quality + 5,
            effort: 6
        });
    }

    const outputBuffer = await processedImage.toBuffer();
    const outputMetadata = await sharp(outputBuffer).metadata();

    return {
        buffer: outputBuffer,
        format: targetFormat,
        width: outputMetadata.width || metadata.width || 0,
        height: outputMetadata.height || metadata.height || 0,
        originalSize,
        processedSize: outputBuffer.length
    };
}

export async function POST(request: NextRequest) {
    const denied = await requireLegacyAdminApi(request, "media");
    if (denied) return denied;
    try {
        const body = await request.json();
        const { imageUrl, folder = 'promo-banners', format = 'avif', quality = 80 } = body;

        const source = parseLegacyAssetSource(imageUrl);
        if (!source) {
            return NextResponse.json(
                { success: false, error: "Desteklenen bir görsel adresi gerekli." },
                { status: 400 }
            );
        }

        const assetFolder = getFolderConfig(typeof folder === "string" ? folder : "default");
        const processed = await optimizeImageFromUrl(source, assetFolder, format === "webp" ? "webp" : "avif", Number.isFinite(quality) ? Math.min(95, Math.max(1, quality)) : 80);

        const timestamp = Date.now();
        const fileName = `optimized_${timestamp}.${processed.format}`;
        
        const result = await uploadToR2(
            processed.buffer,
            fileName,
            `image/${processed.format}`,
            assetFolder
        );

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            url: resolveAdminAssetUrl(result.url) || result.url,
            key: result.key,
            format: processed.format,
            width: processed.width,
            height: processed.height,
            originalSize: processed.originalSize,
            processedSize: processed.processedSize,
            savings: Math.round((1 - processed.processedSize / processed.originalSize) * 100)
        });

    } catch (error) {
        console.error("Optimize API error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
