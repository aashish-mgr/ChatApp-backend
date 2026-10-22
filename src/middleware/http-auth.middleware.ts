import type { NextFunction, Request, Response } from "express";
import { decodeToken } from "../modules/auth/token.util";
import type { AuthUser } from "../modules/auth/auth.types";

/** A request that has passed `requireHttpAuth`. */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/**
 * Reads the access token from the `Authorization: Bearer <token>` header.
 *
 * The Socket.IO handshake uses `auth.token` instead, so this is the HTTP
 * counterpart of `extractToken`.
 */
export const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;

  const [scheme, ...rest] = header.split(" ");
  const token = rest.join(" ").trim();
  if (!token || !scheme || scheme.toLowerCase() !== "bearer") return null;

  return token;
};

/**
 * Rejects requests without a valid access token.
 *
 * The token may also arrive as a `token` query parameter, so an attachment
 * URL can be opened directly in a browser tab (where no `Authorization`
 * header can be set).
 */
export const requireHttpAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token =
    extractBearerToken(req) ??
    (typeof req.query.token === "string" ? req.query.token.trim() : null);

  if (!token) {
    res.status(401).json({
      status: 401,
      message: "Authentication required.",
    });
    return;
  }

  try {
    (req as AuthenticatedRequest).user = decodeToken(token);
    next();
  } catch {
    res.status(401).json({
      status: 401,
      message: "Invalid or expired session.",
    });
  }
};
