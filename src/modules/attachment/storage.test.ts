import { describe, expect, it } from "vitest";
import { isSafeStoredName } from "./storage";

describe("isSafeStoredName", () => {
  it("accepts a uuid with an extension", () => {
    expect(
      isSafeStoredName("3f8b1c2a-4d5e-6f70-8a9b-0c1d2e3f4a5b.png"),
    ).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isSafeStoredName("../../secret.png")).toBe(false);
    expect(isSafeStoredName("..\\..\\secret.png")).toBe(false);
  });

  it("rejects names that are not uuid-based", () => {
    expect(isSafeStoredName("secret.png")).toBe(false);
    expect(isSafeStoredName("")).toBe(false);
  });
});
