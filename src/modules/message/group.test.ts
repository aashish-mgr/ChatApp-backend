import { describe, expect, it } from "vitest";
import {
  GROUP_ADMIN_ROLE,
  GROUP_MEMBER_ROLE,
  isGroupAdmin,
  resolveGroupMemberIds,
} from "./group";

describe("resolveGroupMemberIds", () => {
  it("adds the creator and keeps the requested members", () => {
    expect(resolveGroupMemberIds("me", ["a", "b"])).toEqual(["a", "b", "me"]);
  });

  it("removes duplicates", () => {
    expect(resolveGroupMemberIds("me", ["a", "a", "me"])).toEqual(["a", "me"]);
  });

  it("drops empty and non-string ids", () => {
    expect(
      resolveGroupMemberIds("me", ["a", "", null, 7, undefined]),
    ).toEqual(["a", "me"]);
  });

  it("still includes the creator when the list is not an array", () => {
    expect(resolveGroupMemberIds("me", "nope")).toEqual(["me"]);
  });

  it("yields only the creator when no members are requested", () => {
    expect(resolveGroupMemberIds("me", [])).toEqual(["me"]);
  });
});

describe("isGroupAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isGroupAdmin(GROUP_ADMIN_ROLE)).toBe(true);
    expect(isGroupAdmin(GROUP_MEMBER_ROLE)).toBe(false);
    expect(isGroupAdmin(null)).toBe(false);
    expect(isGroupAdmin(undefined)).toBe(false);
  });
});
