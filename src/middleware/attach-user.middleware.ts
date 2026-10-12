import type { ExtendedError, Socket } from "socket.io";
import { decodeToken, extractToken } from "../modules/auth/token.util";
import { setAuthUser } from "../modules/auth/socket-user.util";

/**
 * Handshake middleware: decode `auth.token` (if present) and attach the user.
 * It never rejects the connection, so public events (register/login) still work.
 *
 * io.use(attachUser)
 */
export const attachUser = (
  socket: Socket,
  next: (err?: ExtendedError) => void,
): void => {
  try {
    const token = extractToken(socket);
    if (token) {
      setAuthUser(socket, decodeToken(token));
    }
  } catch {
    // Invalid or expired token: keep the socket connected but unauthenticated.
  }
  next();
};
