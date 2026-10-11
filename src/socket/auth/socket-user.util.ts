import type { Socket } from "socket.io";
import type { AuthUser, SocketAuthData } from "./auth.types";

/** Returns the authenticated user attached to the socket, if any. */
export const getAuthUser = (socket: Socket): AuthUser | undefined =>
  (socket.data as SocketAuthData).user;

/** Attaches the authenticated user to the socket. */
export const setAuthUser = (socket: Socket, user: AuthUser): void => {
  (socket.data as SocketAuthData).user = user;
};
