import type { Server, Socket } from "socket.io";
import type { AuthUser } from "./auth.types";
import { getAuthUser, getUserRoom, setAuthUser } from "./socket-user.util";
import { addUserSocket, removeUserSocket } from "../presence/presence.store";

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
