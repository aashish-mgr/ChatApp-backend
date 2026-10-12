import { Server } from "socket.io";
import { authSocket, getAuthUser, getUserRoom } from "../modules/auth";
import { attachUser } from "../middleware";
import { messageSocket } from "../modules/message";

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
    }

    authSocket(io, socket);
    messageSocket(io, socket);
  });
};
