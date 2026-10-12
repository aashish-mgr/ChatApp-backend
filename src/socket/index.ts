import { Server, Socket } from "socket.io";
import {authSocket} from "./auth.socket";
import { attachUser } from "./auth";
import { messageSocket } from "./message.socket";

export const initializeSocket = (io: Server) => {
  // Decode `auth.token` (if present) once per connection and attach the user to
  // socket.data. Sockets without a token are still accepted, so public events
  // (register/login) keep working. Protect specific events with `requireAuth`.
  io.use(attachUser);

  io.on("connection", (socket) => {
    console.log("A user connected");


    authSocket(io, socket);
    messageSocket(io, socket);
  });
};
