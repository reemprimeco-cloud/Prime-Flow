/**
 * Single source of truth for accepted upload types across the app —
 * imported by both the Server Action upload path (lib/actions/orders.ts)
 * and the client FileUpload component (components/shared/file-upload.tsx)
 * so the two can never drift.
 *
 * Extension is treated as the primary signal: browsers report unreliable
 * (often generic or empty) MIME types for design-app formats like .ai,
 * .cdr and .psd, so MIME is only a secondary check.
 */

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export const DESIGN_EXTENSIONS = [...IMAGE_EXTENSIONS, ".pdf", ".ai", ".eps", ".psd", ".cdr", ".zip"];
const DESIGN_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  "application/postscript", // .ai / .eps
  "image/vnd.adobe.photoshop", // .psd
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // common fallback browsers report for .cdr/.ai/.psd
];

export const PRODUCT_IMAGE_ACCEPT = IMAGE_EXTENSIONS.join(",");
export const DESIGN_FILE_ACCEPT = DESIGN_EXTENSIONS.join(",");

export type UploadKind = "image" | "design";
export type FileKind = "image" | "pdf" | "archive" | "design" | "other";

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function isPreviewableImage(fileName: string): boolean {
  return IMAGE_EXTENSIONS.includes(getExtension(fileName));
}

export function isAllowedUpload(file: { name: string; type: string }, kind: UploadKind): boolean {
  const ext = getExtension(file.name);
  const allowedExtensions = kind === "image" ? IMAGE_EXTENSIONS : DESIGN_EXTENSIONS;
  if (allowedExtensions.includes(ext)) return true;

  const allowedMimeTypes = kind === "image" ? IMAGE_MIME_TYPES : DESIGN_MIME_TYPES;
  return allowedMimeTypes.includes(file.type);
}

/** Which icon/preview treatment a file should get, regardless of which field it was uploaded through. */
export function getFileKind(fileName: string): FileKind {
  const ext = getExtension(fileName);
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (ext === ".zip") return "archive";
  if ([".ai", ".eps", ".psd", ".cdr"].includes(ext)) return "design";
  return "other";
}
