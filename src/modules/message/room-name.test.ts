import { describe, expect, it } from "vitest";
import { createRoomName } from "./room-name";

describe("createRoomName", () => {
  it("joins two ids with a colon", () => {
    expect(createRoomName("a", "b")).toBe("a:b");
  });

  it("is independent of argument order", () => {
    expect(createRoomName("user-b", "user-a")).toBe(
      createRoomName("user-a", "user-b"),
    );
  });

  it("sorts the ids for a stable name", () => {
    expect(createRoomName("user-b", "user-a")).toBe("user-a:user-b");
  });
});
