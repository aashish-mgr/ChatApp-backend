import { prisma } from "../../config/prisma";
import { Server, Socket } from "socket.io";
import { getAuthUser, getUserRoom } from "../auth";
import { handleError, requireAuth } from "../../middleware";

const createRoomName = (userA: string, userB: string) => {
  return [userA, userB].sort().join(":");
};

/** Keeps parity with the composer's client-side limit (MAX_MESSAGE_LENGTH). */
const MAX_CONTENT_LENGTH = 4000;

export const messageSocket = (io: Server, socket: Socket) => {
  socket.on(
    "room:open",
    requireAuth(
      handleError(
        async (targetUserId: string, ack?: (result: Object) => void) => {
          const userId = getAuthUser(socket)!.id;

          if (!targetUserId) {
            return ack?.({
              status: 400,
              message: "Please provide target user id.",
            });
          }

          if (targetUserId === userId) {
            return ack?.({
              status: 400,
              message: "You cannot open a room with yourself.",
            });
          }

          const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
          });
          if (!targetUser) {
            return ack?.({
              status: 404,
              message: "Target user not found.",
            });
          }

          const roomName = createRoomName(userId, targetUserId);

          const existingRoom = await prisma.room.findUnique({
            where: {
              name: roomName,
            },
          });

          if (existingRoom) {
            // Rejoin membership if the user had previously left this room,
            // otherwise history/send would reject them with 403.
            await prisma.roomMember.upsert({
              where: {
                userId_roomId: { userId, roomId: existingRoom.id },
              },
              update: {},
              create: { userId, roomId: existingRoom.id },
            });
            socket.join(existingRoom.id);
            io.to(getUserRoom(targetUserId)).emit("room:new", {
              roomId: existingRoom.id,
            });
            return ack?.({
              status: 200,
              message: "Room already exists.",
              roomId: existingRoom.id,
            });
          }

          let newRoom;
          try {
            newRoom = await prisma.room.create({
              data: {
                name: roomName,
                createdById: userId,
                members: {
                  create: [{ userId: userId }, { userId: targetUserId }],
                },
              },
            });
          } catch (error) {
            // A concurrent room:open already created the same room (unique name).
            if ((error as { code?: string }).code === "P2002") {
              const room = await prisma.room.findUnique({
                where: { name: roomName },
              });
              if (room) {
                await prisma.roomMember.upsert({
                  where: {
                    userId_roomId: { userId, roomId: room.id },
                  },
                  update: {},
                  create: { userId, roomId: room.id },
                });
                socket.join(room.id);
                io.to(getUserRoom(targetUserId)).emit("room:new", {
                  roomId: room.id,
                });
                return ack?.({
                  status: 200,
                  message: "Room already exists.",
                  roomId: room.id,
                });
              }
            }
            throw error;
          }

          socket.join(newRoom.id);
          io.to(getUserRoom(targetUserId)).emit("room:new", {
            roomId: newRoom.id,
          });

          return ack?.({
            status: 200,
            message: "Room created successfully.",
            roomId: newRoom.id,
          });
        },
      ),
    ),
  );

  socket.on(
    "room:list",
    requireAuth(
      handleError(async (ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        const rooms = await prisma.room.findMany({
          where: { members: { some: { userId: userId } } },
          include: {
            members: {
              include: { user: { select: { id: true, username: true } } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { sender: { select: { id: true, username: true } } },
            },
          },
        });

        const roomsWithMeta = rooms
          .map((room) => ({
            id: room.id,
            createdAt: room.createdAt,
            members: room.members.map((member) => member.user),
            lastMessage: room.messages[0] ?? null,
          }))
          .sort((a, b) => {
            const aTime = a.lastMessage?.createdAt ?? a.createdAt;
            const bTime = b.lastMessage?.createdAt ?? b.createdAt;
            return bTime.getTime() - aTime.getTime();
          });

        return ack?.({
          status: 200,
          message: "Rooms fetched successfully.",
          rooms: roomsWithMeta,
        });
      }),
    ),
  );

  socket.on(
    "message:history",
    requireAuth(
      handleError(
        async (
          {
            roomId,
            cursor,
            limit,
          }: { roomId: string; cursor?: string; limit?: number },
          ack?: (result: Object) => void,
        ) => {
          const userId = getAuthUser(socket)!.id;

          if (!roomId) {
            return ack?.({
              status: 400,
              message: "Please provide roomId.",
            });
          }

          const room = await prisma.room.findUnique({
            where: { id: roomId },
          });
          if (!room) {
            return ack?.({ status: 404, message: "Room not found." });
          }

          const isRoomMember = await prisma.roomMember.findFirst({
            where: {
              roomId: roomId,
              userId: userId,
            },
          });
          if (!isRoomMember) {
            return ack?.({
              status: 403,
              message: "You are not a member of this room.",
            });
          }

          const take = Math.min(Math.max(limit ?? 50, 1), 100);

          const messages = await prisma.message.findMany({
            where: { roomId: roomId },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: {
              sender: { select: { id: true, username: true } },
            },
          });

          const hasMore = messages.length > take;
          const page = hasMore ? messages.slice(0, take) : messages;
          const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;

          return ack?.({
            status: 200,
            message: "Messages fetched successfully.",
            messages: page,
            nextCursor,
            hasMore,
          });
        },
      ),
    ),
  );

  socket.on(
    "message:send",
    requireAuth(
      handleError(
        async (
          { roomId, content }: { roomId: string; content: string },
          ack?: (result: Object) => void,
        ) => {
          if (!roomId || typeof content !== "string" || !content.trim()) {
            return ack?.({
              status: 400,
              message: "Please provide roomId and content.",
            });
          }
          if (content.length > MAX_CONTENT_LENGTH) {
            return ack?.({
              status: 400,
              message: `Message content must be at most ${MAX_CONTENT_LENGTH} characters.`,
            });
          }
          const userId = getAuthUser(socket)!.id;
          const isRoomMember = await prisma.roomMember.findFirst({
            where: {
              roomId: roomId,
              userId: userId,
            },
          });
          if (!isRoomMember) {
            return ack?.({
              status: 403,
              message: "You are not a member of this room.",
            });
          }

          const message = await prisma.message.create({
            data: {
              roomId: roomId,
              content: content.trim(),
              senderId: userId,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          });

          io.to(roomId).emit("message:new", message);

          return ack?.({
            status: 200,
            message: "Message sent successfully.",
            messageId: message.id,
          });
        },
      ),
    ),
  );

  socket.on(
    "message:delete",
    requireAuth(
      handleError(async (messageId: string, ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        if (!messageId) {
          return ack?.({
            status: 400,
            message: "Please provide messageId.",
          });
        }

        const message = await prisma.message.findFirst({
          where: {
            id: messageId,
          },
        });
        if (!message) {
          return ack?.({ status: 404, message: "Message not found." });
        }

        if (message.senderId !== userId) {
          return ack?.({
            status: 403,
            message: "You are not the sender of this message.",
          });
        }

        await prisma.message.delete({
          where: {
            id: messageId,
          },
        });
        io.to(message.roomId).emit("message:deleted", { messageId });
        return ack?.({ status: 200, message: "Message deleted successfully." });
      }),
    ),
  );

  socket.on(
    "room:leave",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        if (!roomId) {
          return ack?.({
            status: 400,
            message: "Please provide roomId.",
          });
        }

        const isRoomMember = await prisma.roomMember.findFirst({
          where: {
            roomId: roomId,
            userId: userId,
          },
        });
        if (!isRoomMember) {
          return ack?.({
            status: 403,
            message: "You are not a member of this room.",
          });
        }

        // Persist the leave: without this the user keeps showing the room in
        // room:list and can still send/read messages after "leaving".
        await prisma.roomMember.delete({
          where: {
            userId_roomId: { userId, roomId },
          },
        });
        // Tell every device of the leaver (including this one) to drop the
        // room; other members keep it and reconcile through room:list.
        io.to(getUserRoom(userId)).emit("room:deleted", { roomId });
        socket.leave(roomId);
        return ack?.({ status: 200, message: "Left room successfully." });
      }),
    ),
  );

  socket.on(
    "room:delete",
    requireAuth(
      handleError(async (roomId: string, ack?: (result: Object) => void) => {
        const userId = getAuthUser(socket)!.id;

        if (!roomId) {
          return ack?.({
            status: 400,
            message: "Please provide roomId.",
          });
        }

        const room = await prisma.room.findUnique({
          where: {
            id: roomId,
          },
        });
        if (!room) {
          return ack?.({ status: 404, message: "Room not found." });
        }

        // Any member may delete the conversation. Checking membership (not
        // `createdById`) also covers rooms whose creator was deleted, which
        // would otherwise become undeletable forever.
        const isRoomMember = await prisma.roomMember.findFirst({
          where: {
            roomId: roomId,
            userId: userId,
          },
        });
        if (!isRoomMember) {
          return ack?.({
            status: 403,
            message: "You are not a member of this room.",
          });
        }

        await prisma.room.delete({
          where: {
            id: roomId,
          },
        });
        io.to(roomId).emit("room:deleted", { roomId });
        io.socketsLeave(roomId); // Make all sockets leave the room
        return ack?.({ status: 200, message: "Room deleted successfully." });
      }),
    ),
  );
};
