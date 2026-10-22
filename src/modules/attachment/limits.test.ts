import { describe, expect, it } from "vitest";
import {
  extensionForMimeType,
  formatBytes,
  isAllowedMimeType,
  sanitizeFilename,
} from "./limits";

describe("isAllowedMimeType", () => {
  it("accepts images", () => {
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
  });

  it("accepts common documents", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("text/plain")).toBe(true);
  });

  it("rejects executable and unknown types", () => {
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
    expect(isAllowedMimeType("text/html")).toBe(false);
    expect(isAllowedMimeType("")).toBe(false);
    expect(isAllowedMimeType(undefined)).toBe(false);
  });

  it("ignores casing", () => {
    expect(isAllowedMimeType("IMAGE/PNG")).toBe(true);
  });
});

describe("extensionForMimeType", () => {
  it("maps a known type to its extension", () => {
    expect(extensionForMimeType("image/png")).toBe(".png");
    expect(extensionForMimeType("application/pdf")).toBe(".pdf");
  });

  it("falls back to .bin for an unknown type", () => {
    expect(extensionForMimeType("application/octet-stream")).toBe(".bin");
  });
});

describe("sanitizeFilename", () => {
  it("keeps a plain name", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo.png");
  });

  it("drops directory components", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Windows\\system32\\cmd.exe")).toBe("cmd.exe");
  });

  it("drops control characters", () => {
    expect(sanitizeFilename("no\u0000pe.png")).toBe("nope.png");
  });

  it("falls back to a generic name for empty or unusable input", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("   ")).toBe("file");
    expect(sanitizeFilename("..")).toBe("file");
    expect(sanitizeFilename(undefined)).toBe("file");
  });

  it("keeps the name within a header-safe length", () => {
    expect(sanitizeFilename(`${"a".repeat(500)}.png`).length).toBe(200);
  });
});

describe("formatBytes", () => {
  it("reports small files in bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("reports larger files in kilobytes and megabytes", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});
