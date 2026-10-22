/**
 * Upload limits and the file-type allowlist.
 *
 * Kept in one module so the HTTP route, the socket handlers and the tests all
 * agree on what may be uploaded. The frontend mirrors `MAX_ATTACHMENT_SIZE`
 * to validate before it uploads a byte.
 */

/** Largest accepted upload: 10 MB. */
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

/**
 * Accepted MIME types. Images get an inline preview; everything else is
 * offered as a download.
 */
export const ALLOWED_MIME_TYPES = [
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

const ALLOWED_MIME_TYPE_SET = new Set<string>(ALLOWED_MIME_TYPES);

/** True when the MIME type may be uploaded. */
export const isAllowedMimeType = (mimeType: string | undefined): boolean =>
  typeof mimeType === "string" && ALLOWED_MIME_TYPE_SET.has(mimeType.toLowerCase());

/**
 * File extension per MIME type.
 *
 * The extension comes from the type, never from the uploaded name: the name is
 * attacker-controlled, so deriving the extension from it would let a caller
 * write `evil.html` or `evil.php` into the uploads directory.
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
};

/** The extension to store a MIME type under, or ".bin" when unknown. */
export const extensionForMimeType = (mimeType: string): string =>
  EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase()] ?? ".bin";

/**
 * Strips directory components and control characters from an uploaded file
 * name, so it can be shown and used as a download name without ever being
 * used as a path.
 */
export const sanitizeFilename = (filename: string | undefined): string => {
  const raw = (filename ?? "").trim();
  if (!raw) return "file";

  // Take the last path segment only: anything before it is a directory.
  const base = raw.split(/[\\/]/).pop() ?? "";
  // Drop control characters (including NUL) that would corrupt headers.
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "file";

  // Keep it short enough for a Content-Disposition header.
  return cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned;
};

/** Human-readable size, e.g. "1.4 MB". Used in error messages. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || Number.isInteger(value) ? 0 : 1)} ${units[unitIndex]}`;
};
