import { mirrorRemoteImageToR2, toStorageFolderSlug } from "@/lib/remote-image-mirror";

export async function mirrorCategoryImageToR2(
    imageUrl: string,
    options: {
        slug?: string | null;
        name?: string | null;
        cache?: Map<string, string>;
    }
): Promise<string> {
    const folderSlug = toStorageFolderSlug(options.slug || options.name || "kategori");
    return mirrorRemoteImageToR2(imageUrl, {
        folder: `categories/${folderSlug}`,
        fileBase: folderSlug,
        cache: options.cache,
    });
}
