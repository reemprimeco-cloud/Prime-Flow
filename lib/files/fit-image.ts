import { MAX_FILE_SIZE_BYTES } from "@/lib/files/constants";

/**
 * A phone photo is routinely 3–6MB — over the per-file and per-request
 * upload ceilings (see lib/files/constants.ts), so a customer attaching one
 * straight from their camera roll used to be turned away. Photos above this
 * size are re-encoded in the browser before upload; two of them still fit
 * the 4MB request total.
 */
const PHOTO_TARGET_BYTES = 1.5 * 1024 * 1024;

/** Longest edge, then JPEG quality — tried in order until the file fits. */
const STEPS: [number, number][] = [
  [3000, 0.9],
  [2400, 0.85],
  [2000, 0.8],
  [1600, 0.75],
];

/**
 * Shrinks a large photo so it can be uploaded. JPEG/WebP photos are shrunk
 * past PHOTO_TARGET_BYTES; a PNG is only touched when it would otherwise be
 * rejected outright (over MAX_FILE_SIZE_BYTES), since a PNG is often the
 * customer's actual artwork and re-encoding drops its transparency. GIF,
 * SVG and every non-image pass through untouched, as does anything the
 * browser can't decode — the size check downstream still applies.
 */
export async function fitImageForUpload(file: File): Promise<File> {
  const target =
    file.type === "image/jpeg" || file.type === "image/webp"
      ? PHOTO_TARGET_BYTES
      : file.type === "image/png"
        ? MAX_FILE_SIZE_BYTES
        : null;
  if (target === null || file.size <= target) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    for (const [edge, quality] of STEPS) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      // JPEG has no alpha — transparent areas come out white, not black.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= target) {
        const name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
        return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
      }
    }
    return file;
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
