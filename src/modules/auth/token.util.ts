import type { Socket } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { envConfig } from "../../config/env";
import type { AuthUser } from "./auth.types";

/** Reads the token sent in the socket handshake: io(url, { auth: { token } }). */
export const extractToken = (socket: Socket): string | null => {
  const token = socket.handshake.auth?.token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
};

/** Verifies the JWT and returns the authenticated user. */
export const decodeToken = (token: string): AuthUser => {
  if (!envConfig.jwtSecret) {
    throw new Error("JWT configuration is missing.");
  }

  const decoded = jwt.verify(token, envConfig.jwtSecret);
  if (
    typeof decoded === "string" ||
    typeof (decoded as JwtPayload).id !== "string"
  ) {
    throw new Error("Invalid token.");
  }

  return { id: (decoded as JwtPayload).id as string };
};
