import { describe, expect, it } from "vitest";
import { validateCredentials } from "./credentials";

describe("validateCredentials", () => {
  it("requires both fields", () => {
    expect(validateCredentials({ username: "", password: "" })).toMatch(
      /provide username and password/i,
    );
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(validateCredentials({ username: "ab", password: "secret1" })).toMatch(
      /3-32/,
    );
  });

  it("rejects usernames longer than 32 characters", () => {
    expect(
      validateCredentials({ username: "x".repeat(33), password: "secret1" }),
    ).toMatch(/3-32/);
  });

  it("rejects passwords shorter than 6 characters", () => {
    expect(validateCredentials({ username: "alice", password: "12345" })).toMatch(
      /at least 6/,
    );
  });

  it("accepts valid credentials", () => {
    expect(
      validateCredentials({ username: "alice", password: "secret1" }),
    ).toBeNull();
  });
});
