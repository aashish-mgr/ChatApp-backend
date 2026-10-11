import type { Socket } from "socket.io";
import { getAuthUser } from "./socket-user.util";

type SocketEventHandler = (...args: any[]) => void | Promise<void>;

const AUTH_ERROR = { status: 401, message: "Authentication required." };

/**
 * Wraps a specific event so it only runs for authenticated sockets.
 *
 * socket.on("send_message", requireAuth((payload) => {
 *   const user = getAuthUser(socket);
 *   // ...
 * }));
 *
 * When unauthenticated it calls the client's ack with `{ status: 401 }` (if
 * provided) or emits an `auth_error` event, then skips the handler.
 */
export const requireAuth =
  (handler: SocketEventHandler): SocketEventHandler =>
  async function (this: Socket, ...args: any[]): Promise<void> {
    const socket = this;

    if (!getAuthUser(socket)) {
      const ack = args.at(-1);
      if (typeof ack === "function") {
        ack(AUTH_ERROR);
      } else {
        socket.emit("auth_error", AUTH_ERROR);
      }
      return;
    }

    await handler.apply(socket, args);
  };
