import type { Socket } from "socket.io";
import type { AuthUser, SocketAuthData } from "./auth.types";

/** Returns the authenticated user attached to the socket, if any. */
export const getAuthUser = (socket: Socket): AuthUser | undefined =>
  (socket.data as SocketAuthData).user;

/** Attaches the authenticated user to the socket. */
export const setAuthUser = (socket: Socket, user: AuthUser): void => {
  (socket.data as SocketAuthData).user = user;
};

/**
 * Name of a user's personal socket.io room. Every socket belonging to the user
 * joins it on connect, so they can be reached across all their devices.
 */
export const getUserRoom = (userId: string): string => `user:${userId}`;
