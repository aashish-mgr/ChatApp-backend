/**
 * Deterministic 1:1 room identifier: the two user ids sorted and joined with
 * ":". Sorting makes both participants compute the same name no matter who
 * opens the conversation first.
 */
export const createRoomName = (userA: string, userB: string): string =>
  [userA, userB].sort().join(":");
