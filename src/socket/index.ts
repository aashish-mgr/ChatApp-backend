import { Server, Socket } from "socket.io";
import {authSocket} from "./auth.socket";

export const initializeSocket = (io: Server) => {
  io.on("connection", (socket) => {
    console.log("A user connected");


    authSocket(io, socket);
  });
};
