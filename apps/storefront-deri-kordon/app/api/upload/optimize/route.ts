import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import sharp from "sharp";

export const dynamic = 'force-dynamic';

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
    if (folder in MAX_DIMENSIONS) return folder;
    return 'default';
}

async function optimizeImageFromUrl(
    imageUrl: string,
    folder: string,
    targetFormat: 'avif' | 'webp' = 'avif',
    quality: number = 80
) {
    const configKey = getFolderConfig(folder);
    const dimensions = MAX_DIMENSIONS[configKey as keyof typeof MAX_DIMENSIONS] || MAX_DIMENSIONS.default;

    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
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
    try {
        const body = await request.json();
        const { imageUrl, folder = 'promo-banners', format = 'avif', quality = 80 } = body;

        if (!imageUrl) {
            return NextResponse.json(
                { success: false, error: "Image URL is required" },
                { status: 400 }
            );
        }

        const processed = await optimizeImageFromUrl(imageUrl, folder, format, quality);

        const timestamp = Date.now();
        const fileName = `optimized_${timestamp}.${processed.format}`;
        
        const result = await uploadToR2(
            processed.buffer,
            fileName,
            `image/${processed.format}`,
            folder
        );

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            url: result.url,
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
