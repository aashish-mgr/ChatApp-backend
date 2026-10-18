import { Server, Socket } from "socket.io";
import { prisma } from "../../config/prisma";
import { getAuthUser } from "../auth";

/**
 * How long a typing signal survives without a refresh. The client re-emits
 * `typing:start` roughly every two seconds while the user keeps typing; if it
 * never does (tab closed, crash, network drop) this timer clears the state so
 * nobody is left stuck as "typing…".
 */
const TYPING_TTL_MS = 3000;

interface TypingEntry {
  timer: NodeJS.Timeout;
  /** The socket that started typing, so another tab closing can't clear it. */
  socketId: string;
}

/** `${userId}:${roomId}` -> pending TTL timer. */
const typingTimers = new Map<string, TypingEntry>();

const typingKey = (userId: string, roomId: string): string =>
  `${userId}:${roomId}`;

/**
 * Clears a user's typing state for a room: cancels the TTL timer and, when a
 * signal was actually live, tells the room. Safe to call for a user who isn't
 * typing (a no-op). Returns whether anything was broadcast.
 */
export const stopTypingFor = (
  io: Server,
  userId: string,
  roomId: string,
): boolean => {
  const key = typingKey(userId, roomId);
  const entry = typingTimers.get(key);
  if (!entry) return false;

  clearTimeout(entry.timer);
  typingTimers.delete(key);
  io.to(roomId).emit("typing:state", { roomId, userId, typing: false });
  return true;
};

/** Clears every typing signal a socket had live. Used on disconnect. */
export const stopAllTypingForSocket = (io: Server, socketId: string): void => {
  for (const [key, entry] of typingTimers) {
    if (entry.socketId !== socketId) continue;
    const separator = key.indexOf(":");
    stopTypingFor(io, key.slice(0, separator), key.slice(separator + 1));
  }
};

interface TypingPayload {
  roomId?: unknown;
}

export const typingSocket = (io: Server, socket: Socket) => {
  socket.on("typing:start", async (payload?: TypingPayload) => {
    const roomId = payload?.roomId;
    const user = getAuthUser(socket);
    if (!user || typeof roomId !== "string" || !roomId) return;

    try {
      // Typing is best-effort: an unauthenticated or non-member sender is
      // ignored silently (no ack to surface an error into).
      const membership = await prisma.roomMember.findFirst({
        where: { roomId, userId: user.id },
        select: { roomId: true },
      });
      if (!membership) return;

      const key = typingKey(user.id, roomId);
      const existing = typingTimers.get(key);
      if (existing) clearTimeout(existing.timer);

      // Broadcast only the transition into "typing"; refreshes merely re-arm
      // the timer. That bounds the traffic to one emit per state change
      // instead of one per keystroke.
      if (!existing) {
        io.to(roomId).emit("typing:state", {
          roomId,
          userId: user.id,
          typing: true,
        });
      }

      typingTimers.set(key, {
        socketId: socket.id,
        timer: setTimeout(() => {
          stopTypingFor(io, user.id, roomId);
        }, TYPING_TTL_MS),
      });
    } catch (error) {
      // Never let a typing hiccup disturb the socket; the TTL timer of any
      // earlier signal still clears stale state on its own.
      console.error("typing:start error:", error);
    }
  });

  socket.on("typing:stop", (payload?: TypingPayload) => {
    const roomId = payload?.roomId;
    const user = getAuthUser(socket);
    if (!user || typeof roomId !== "string" || !roomId) return;
    stopTypingFor(io, user.id, roomId);
  });

  socket.on("disconnect", () => {
    stopAllTypingForSocket(io, socket.id);
  });
};
