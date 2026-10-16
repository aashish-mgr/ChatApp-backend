import { Socket, Server } from "socket.io";
import { UserLoginRegister } from "./auth.types";
import { prisma } from "../../config/prisma";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { envConfig } from "../../config/env";
import {
  joinUserRooms,
  registerAuthenticatedSocket,
} from "./authenticated-socket";

interface AuthResponse {
  status: number;
  message: string;
  data?: string;
  user?: { id: string; username: string };
}

type Ack = (response: AuthResponse) => void;

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 6;

/** Returns an error message for invalid credentials, or null when valid. */
const validateCredentials = (
  userData: UserLoginRegister,
): string | null => {
  if (!userData?.username || !userData?.password) {
    return "Please provide username and password.";
  }
  if (
    userData.username.length < MIN_USERNAME_LENGTH ||
    userData.username.length > MAX_USERNAME_LENGTH
  ) {
    return `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters.`;
  }
  if (userData.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
};

export const authSocket = (io: Server, socket: Socket) => {
  socket.on("register", async (userData: UserLoginRegister, ack?: Ack) => {
    if (typeof ack !== "function") return;

    try {
      const validationError = validateCredentials(userData);
      if (validationError) {
        return ack({ status: 400, message: validationError });
      }

      const existingUser = await prisma.user.findUnique({
        where: { username: userData.username },
      });
      if (existingUser) {
        return ack({
          status: 400,
          message: "A user already exists with that username.",
        });
      }

      await prisma.user.create({
        data: {
          username: userData.username,
          password: await bcrypt.hash(userData.password, 10),
        },
      });

      return ack({ status: 200, message: "User registered successfully" });
    } catch (error) {
      console.error("register error:", error);
      return ack({
        status: 500,
        message: "Something went wrong. Please try again.",
      });
    }
  });

  socket.on("login", async (userData: UserLoginRegister, ack?: Ack) => {
    if (typeof ack !== "function") return;

    try {
      // Presence only: accounts created before the register rules exist, and
      // rejecting them here would lock users out of their own usernames.
      if (!userData?.username || !userData?.password) {
        return ack({
          status: 400,
          message: "Please provide username and password.",
        });
      }

      const user = await prisma.user.findUnique({
        where: { username: userData.username },
      });

      if (!user) {
        return ack({ status: 400, message: "Invalid username or password." });
      }

      const isPasswordValid = await bcrypt.compare(
        userData.password,
        user.password,
      );
      if (!isPasswordValid) {
        return ack({ status: 400, message: "Invalid username or password." });
      }

      const jwtSecret = envConfig.jwtSecret;
      const accessTokenExpire = envConfig.accessTokenExpire;

      if (!jwtSecret || !accessTokenExpire) {
        return ack({ status: 500, message: "JWT configuration is missing." });
      }

      const token = jwt.sign({ id: user.id }, jwtSecret, {
        expiresIn: accessTokenExpire as NonNullable<SignOptions["expiresIn"]>,
      });

      // Authenticate this socket so protected events can run on it right away
      // (without requiring a reconnect carrying the token). Also joins the
      // presence rooms and broadcasts `presence:update` — without this a fresh
      // login looked offline to everyone until the socket reconnected.
      registerAuthenticatedSocket(io, socket, { id: user.id });
      // Rejoin chat-room channels so broadcasts (message:new, ...) reach this
      // socket even if it connected anonymously before logging in.
      await joinUserRooms(socket, user.id);

      return ack({
        status: 200,
        message: "User logged in successfully.",
        data: token,
        user: { id: user.id, username: user.username },
      });
    } catch (error) {
      console.error("login error:", error);
      return ack({
        status: 500,
        message: "Something went wrong. Please try again.",
      });
    }
  });
};
