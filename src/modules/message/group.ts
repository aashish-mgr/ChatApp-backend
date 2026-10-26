/** Role given to the creator of a group; everyone else starts as a member. */
export const GROUP_ADMIN_ROLE = "admin";
export const GROUP_MEMBER_ROLE = "member";

/**
 * Normalizes the member list of a new group: drops empty/duplicate ids and the
 * creator (who is always added), and guarantees the creator is included so the
 * group can never be created without an admin.
 */
export const resolveGroupMemberIds = (
  creatorId: string,
  memberIds: unknown,
): string[] => {
  const requested = Array.isArray(memberIds)
    ? memberIds.filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id !== creatorId,
      )
    : [];

  return Array.from(new Set([...requested, creatorId]));
};

/** True when the role may manage members and delete the group. */
export const isGroupAdmin = (role: string | null | undefined): boolean =>
  role === GROUP_ADMIN_ROLE;
