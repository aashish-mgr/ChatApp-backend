import { describe, expect, it } from "vitest";
import type { Socket } from "socket.io";
import { extractToken } from "./token.util";

/** Only `handshake.auth` is read, so a minimal shape is enough. */
const socketWith = (auth: unknown): Socket =>
  ({ handshake: { auth } }) as unknown as Socket;

describe("extractToken", () => {
  it("returns the token from the handshake", () => {
    expect(extractToken(socketWith({ token: "abc" }))).toBe("abc");
  });

  it("trims surrounding whitespace", () => {
    expect(extractToken(socketWith({ token: "  abc  " }))).toBe("abc");
  });

  it("returns null when there is no usable token", () => {
    expect(extractToken(socketWith({}))).toBeNull();
    expect(extractToken(socketWith({ token: 123 }))).toBeNull();
    expect(extractToken(socketWith({ token: "   " }))).toBeNull();
  });
});
