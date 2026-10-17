import { afterEach, describe, expect, it } from "vitest";
import {
  addUserSocket,
  isUserOnline,
  removeUserSocket,
} from "./presence.store";

// Every socket we register is tracked so the shared store is left clean for the
// next test.
const tracked: Array<[userId: string, socketId: string]> = [];

const register = (userId: string, socketId: string): boolean => {
  tracked.push([userId, socketId]);
  return addUserSocket(userId, socketId);
};

afterEach(() => {
  while (tracked.length > 0) {
    const entry = tracked.pop();
    if (entry) removeUserSocket(entry[0], entry[1]);
  }
});

describe("presence store", () => {
  it("reports the first socket as coming online", () => {
    expect(register("user-1", "socket-a")).toBe(true);
    expect(isUserOnline("user-1")).toBe(true);
  });

  it("keeps a user online while another socket remains", () => {
    register("user-2", "socket-a");
    expect(register("user-2", "socket-b")).toBe(false);
    expect(removeUserSocket("user-2", "socket-a")).toBe(false);
    expect(isUserOnline("user-2")).toBe(true);
  });

  it("reports the last socket as going offline", () => {
    register("user-3", "socket-a");
    register("user-3", "socket-b");
    expect(removeUserSocket("user-3", "socket-a")).toBe(false);
    expect(removeUserSocket("user-3", "socket-b")).toBe(true);
    expect(isUserOnline("user-3")).toBe(false);
  });

  it("ignores removal of an unknown socket", () => {
    expect(removeUserSocket("nobody", "socket-x")).toBe(false);
  });
});
