import { Server } from "socket.io";
import {
  AUTHENTICATED_ROOM,
  authSocket,
  getAuthUser,
  joinUserRooms,
  registerAuthenticatedSocket,
} from "../modules/auth";
import { attachUser } from "../middleware";
import { messageSocket } from "../modules/message";
import { userSocket } from "../modules/user";
import { presenceSocket, removeUserSocket } from "../modules/presence";

export const initializeSocket = (io: Server) => {
  // Decode `auth.token` (if present) once per connection and attach the user to
  // socket.data. Sockets without a token are still accepted, so public events
  // (register/login) keep working. Protect specific events with `requireAuth`.
  io.use(attachUser);

  io.on("connection", (socket) => {
    console.log("A user connected");

    // Sockets that connected with a valid handshake token are already
    // authenticated; register them for presence and put them in their personal
    // room so they can receive events (e.g. "room:new") across all devices.
    const user = getAuthUser(socket);
    if (user) {
      registerAuthenticatedSocket(io, socket, user);
      // Fire-and-forget: joining must not delay the module wiring below.
      void joinUserRooms(socket, user.id);
    }

    authSocket(io, socket);
    messageSocket(io, socket);
    userSocket(io, socket);
    presenceSocket(io, socket);

    socket.on("disconnect", () => {
      const disconnected = getAuthUser(socket);
      if (!disconnected) return;

      // Announce only when the user's last socket disconnects.
      if (removeUserSocket(disconnected.id, socket.id)) {
        io.to(AUTHENTICATED_ROOM).emit("presence:update", {
          userId: disconnected.id,
          online: false,
        });
      }
    });
  });
};
