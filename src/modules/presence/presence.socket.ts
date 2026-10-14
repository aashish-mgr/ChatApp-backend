import { Server, Socket } from "socket.io";
import { handleError, requireAuth } from "../../middleware";
import { getOnlineUserIds } from "./presence.store";

type PresenceListAck = (result: {
  status: number;
  message: string;
  onlineUserIds?: string[];
}) => void;

export const presenceSocket = (_io: Server, socket: Socket) => {
  // Lets a client seed its online-user state on connect / reconnect. Changes
  // after that arrive through the broadcast `presence:update` event.
  socket.on(
    "presence:list",
    requireAuth(
      handleError(async (ack?: PresenceListAck) => {
        return ack?.({
          status: 200,
          message: "Online users fetched successfully.",
          onlineUserIds: getOnlineUserIds(),
        });
      }),
    ),
  );
};
