import { Socket } from "socket.io";
type SocketEventHandler = (...args: any[]) => void | Promise<void>;

export const handleError = (handler: SocketEventHandler): SocketEventHandler =>
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
  }