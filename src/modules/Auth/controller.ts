import { prisma } from "../../config/prisma";
import { Server, Socket } from "socket.io";

interface User {
  username: string;
}

class AuthController {
  public initialize(io: Server) {
    io.on("connection", (socket) => {
      console.log("A user connected");
      socket.on("register", async (userData: User) => {
        this.registerUser(socket, userData);
      });

      socket.on("login", async (userData: User) => {
       this.loginUser(socket, userData);
      });
    });
  }

  public async registerUser(socket: Socket, userData: User) {
     if (userData) {
          const existingUser = await prisma.user.findFirst({
            where: {
              username: userData?.username,
            },
          });
          if (existingUser) {
            return socket.emit("response", {
              status: 400,
              message: "A user already exist with that username.",
            });
          }
          await prisma.user.create({ data: userData });
          socket.emit("response", {
            status: 200,
            message: "User registered successfully",
          });
        }
        else {
        return socket.emit("response", {
          message: "Please provide all the details.",
        });
    }
  }

  public async loginUser (socket: Socket, userData: User) {
       if (userData) {
          const user = await prisma.user.findFirst({
            where: {
              username: userData?.username,
            },
          });
          return socket.emit("response", {
            status: 200,
            message: "User logged in successfully.",
            data: user,
          });
        }
        else {
        return socket.emit("response", {
          message: "Please provide all the details.",
        });
    }
  }
}

export default new AuthController();
