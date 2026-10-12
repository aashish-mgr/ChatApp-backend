import type { Socket } from "socket.io";

type SocketEventHandler = (...args: any[]) => void | Promise<void>;

/**
 * Wraps an event handler so uncaught errors never crash the socket and the
 * client always receives an acknowledgement (`{ status: 500 }`) when possible.
 *
 * socket.on("message:send", handleError(async (payload, ack) => { ... }));
 */
export const handleError =
  (handler: SocketEventHandler): SocketEventHandler =>
  async function (this: Socket, ...args: any[]): Promise<void> {
    try {
      await handler.apply(this, args);
    } catch (error) {
      console.error("Socket event error:", error);
      const ack = args.at(-1);
      if (typeof ack === "function") {
        ack({ status: 500, message: "Internal server error." });
      }
    }
  };
