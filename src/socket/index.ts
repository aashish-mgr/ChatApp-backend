import { Server } from "socket.io";
import { authSocket, getAuthUser, getUserRoom } from "../modules/auth";
import { attachUser } from "../middleware";
import { messageSocket } from "../modules/message";
import { userSocket } from "../modules/user";
import {
  addUserSocket,
  presenceSocket,
  removeUserSocket,
} from "../modules/presence";

/**
 * Room every authenticated socket joins, so presence updates only reach
 * signed-in clients (not the anonymous sockets used during register/login).
 */
const AUTHENTICATED_ROOM = "authenticated";

export const initializeSocket = (io: Server) => {
  // Decode `auth.token` (if present) once per connection and attach the user to
  // socket.data. Sockets without a token are still accepted, so public events
  // (register/login) keep working. Protect specific events with `requireAuth`.
  io.use(attachUser);

  io.on("connection", (socket) => {
    console.log("A user connected");

    // Sockets that connected with a valid handshake token are already
    // authenticated; put them in their personal room so they can receive
    // events (e.g. "room:new") across all their devices.
    const user = getAuthUser(socket);
    if (user) {
      socket.join(getUserRoom(user.id));
      socket.join(AUTHENTICATED_ROOM);

      // Announce only when the user's first socket connects.
      if (addUserSocket(user.id, socket.id)) {
        io.to(AUTHENTICATED_ROOM).emit("presence:update", {
          userId: user.id,
          online: true,
        });
      }
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
