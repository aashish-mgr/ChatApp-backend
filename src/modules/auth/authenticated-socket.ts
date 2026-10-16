import type { Server, Socket } from "socket.io";
import type { AuthUser } from "./auth.types";
import { getAuthUser, getUserRoom, setAuthUser } from "./socket-user.util";
import { addUserSocket, removeUserSocket } from "../presence/presence.store";
import { prisma } from "../../config/prisma";

/**
 * Room every authenticated socket joins, so presence updates only reach
 * signed-in clients (not the anonymous sockets used during register/login).
 */
export const AUTHENTICATED_ROOM = "authenticated";

/**
 * Marks a socket as authenticated and wires it up for presence:
 *
 * - attaches the user to `socket.data` (requireAuth checks this),
 * - joins the personal room (`user:<id>`) and the authenticated room,
 * - registers the socket in the presence store and broadcasts
 *   `presence:update` when it is the user's first socket.
 *
 * Used both when a socket connects with a valid handshake token and when it
 * authenticates later via the `login` event, so presence behaves identically
 * either way.
 */
export const registerAuthenticatedSocket = (
  io: Server,
  socket: Socket,
  user: AuthUser,
): void => {
  // Re-login as a different user on the same socket: drop the previous
  // user's presence so their online status doesn't leak as stale.
  const previous = getAuthUser(socket);
  if (previous && previous.id !== user.id) {
    socket.leave(getUserRoom(previous.id));
    if (removeUserSocket(previous.id, socket.id)) {
      io.to(AUTHENTICATED_ROOM).emit("presence:update", {
        userId: previous.id,
        online: false,
      });
    }
  }

  setAuthUser(socket, user);
  socket.join(getUserRoom(user.id));
  socket.join(AUTHENTICATED_ROOM);

  // Announce only when the user's first socket connects.
  if (addUserSocket(user.id, socket.id)) {
    io.to(AUTHENTICATED_ROOM).emit("presence:update", {
      userId: user.id,
      online: true,
    });
  }
};

/**
 * Joins the socket to every chat room the user is a member of.
 *
 * Socket.IO room membership dies with the connection, so without this a
 * reconnecting client would silently miss `message:new` / `message:deleted`
 * broadcasts for every room except the one the frontend happens to re-open.
 * Called after both a token-authenticated connect and a `login`.
 */
export const joinUserRooms = async (
  socket: Socket,
  userId: string,
): Promise<void> => {
  try {
    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      select: { roomId: true },
    });
    for (const { roomId } of memberships) {
      await socket.join(roomId);
    }
  } catch (error) {
    // Never fail the connection over a room-join hiccup; the client can
    // still re-open rooms explicitly via `room:open`.
    console.error("joinUserRooms error:", error);
  }
};
