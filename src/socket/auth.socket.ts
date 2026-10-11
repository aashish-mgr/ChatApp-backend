import { Socket, Server } from "socket.io";
import { UserLoginRegiser } from "./types";
import { prisma } from "../config/prisma";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { envConfig } from "../config/env";
import { setAuthUser } from "./auth";

export const authSocket = (io: Server, socket: Socket) => {
  socket.on("register", async (userData: UserLoginRegiser) => {
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
      await prisma.user.create({
        data: {
          username: userData?.username,
          password: await bcrypt.hash(userData?.password, 10),
        },
      });

      socket.emit("response", {
        status: 200,
        message: "User registered successfully",
      });
    } else {
      return socket.emit("response", {
        message: "Please provide all the details.",
      });
    }
  });

  socket.on("login", async (userData: UserLoginRegiser) => {
    if (userData) {
      const user = await prisma.user.findFirst({
        where: {
          username: userData?.username,
        },
      });

      if (!user) {
        return socket.emit("response", {
          status: 400,
          message: "User not found.",
        });
      }

      const isPasswordValid = await bcrypt.compare(
        userData?.password,
        user.password,
      );
      if (!isPasswordValid) {
        return socket.emit("response", {
          status: 400,
          message: "Invalid password.",
        });
      }

      const jwtSecret = envConfig.jwtSecret;
      const accessTokenExpire = envConfig.accessTokenExpire;

      if (!jwtSecret || !accessTokenExpire) {
        return socket.emit("response", {
          status: 500,
          message: "JWT configuration is missing.",
        });
      }

      const token = jwt.sign({ id: user.id }, jwtSecret, {
        expiresIn: accessTokenExpire as NonNullable<SignOptions["expiresIn"]>,
      });

      // Authenticate this socket so protected events can run on it right away
      // (without requiring a reconnect carrying the token).
      setAuthUser(socket, { id: user.id });

      return socket.emit("response", {
        status: 200,
        message: "User logged in successfully.",
        data: token,
      });
    } else {
      return socket.emit("response", {
        message: "Please provide all the details.",
      });
    }
  });
};
